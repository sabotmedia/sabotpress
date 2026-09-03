import { handleInstagramCallback } from './campaign-instagram-auth.js'

export async function onRequestGet(context) {
  return handleInstagramCallback(context)
}
