import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { capabilitiesForRole, hashPassword, PASSWORD_ITERATIONS, verifyPassword } from '../functions/api/_lib/adminUsers.js'

test('passwords are PBKDF2 hashed with a random salt and verify without plaintext storage', async () => {
  const first = await hashPassword('correct horse battery staple')
  const second = await hashPassword('correct horse battery staple')
  assert.notEqual(first.hash, 'correct horse battery staple')
  assert.notEqual(first.hash, second.hash)
  assert.notEqual(first.salt, second.salt)
  assert.equal(PASSWORD_ITERATIONS, 100000)
  assert.equal(first.iterations, PASSWORD_ITERATIONS)
  assert.equal(await verifyPassword('correct horse battery staple', {
    password_hash: first.hash,
    password_salt: first.salt,
    password_iterations: first.iterations,
  }), true)
  assert.equal(await verifyPassword('incorrect password', {
    password_hash: first.hash,
    password_salt: first.salt,
    password_iterations: first.iterations,
  }), false)
  assert.equal(await verifyPassword('correct horse battery staple', {
    password_hash: first.hash,
    password_salt: first.salt,
    password_iterations: 100001,
  }), false)
})

test('role capability boundaries match the production access model', () => {
  assert.deepEqual(capabilitiesForRole('owner'), ['*'])
  assert.ok(capabilitiesForRole('admin').includes('users:manage'))
  assert.ok(capabilitiesForRole('admin').includes('site:manage'))
  assert.ok(capabilitiesForRole('editor').includes('content:write'))
  assert.ok(capabilitiesForRole('editor').includes('media:write'))
  assert.equal(capabilitiesForRole('editor').includes('users:manage'), false)
  assert.deepEqual(capabilitiesForRole('viewer'), ['analytics:view'])
})

test('user API protects owners and never returns credential fields through public user records', () => {
  const api = fs.readFileSync(new URL('../functions/api/users.js', import.meta.url), 'utf8')
  const model = fs.readFileSync(new URL('../functions/api/_lib/adminUsers.js', import.meta.url), 'utf8')
  assert.match(api, /users:manage/)
  assert.match(api, /cannot demote or disable the final active owner/)
  assert.match(api, /cannot delete the final active owner/)
  assert.match(model, /password_hash/)
  assert.match(model, /password_salt/)
  const publicUserBody = model.slice(model.indexOf('export function publicUser'), model.indexOf('function randomBytes'))
  assert.doesNotMatch(publicUserBody, /password_hash|password_salt|password_iterations/)
})

test('login supports individual identity first and preserves explicit emergency bootstrap path', () => {
  const loginApi = fs.readFileSync(new URL('../functions/api/login.js', import.meta.url), 'utf8')
  const loginUi = fs.readFileSync(new URL('../src/components/LoginPage.jsx', import.meta.url), 'utf8')
  assert.match(loginApi, /getAdminUserByEmail/)
  assert.match(loginApi, /verifyPassword/)
  assert.match(loginApi, /loginBootstrap/)
  assert.match(loginUi, /SabotPress sign in/)
  assert.match(loginUi, /Emergency \/ bootstrap admin token/)
  assert.match(loginUi, /autoComplete="username"/)
})

test('edge middleware enforces capability-specific writes', () => {
  const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8')
  for (const capability of ['users:manage', 'site:manage', 'content:write', 'media:write', 'publishing:write']) {
    assert.match(middleware, new RegExp(capability.replace(':', '\\:')))
  }
  assert.match(middleware, /permissionHasCapability/)
  assert.match(middleware, /permission required:/)
})

test('legacy advisory Editor Roles UI redirects to real Users and Access', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /path=\{adminRoutes\.roles\} element=\{protect\(<Navigate to=\{adminRoutes\.users\}/)
  assert.doesNotMatch(app, /<EditorRolesPage/)
})
