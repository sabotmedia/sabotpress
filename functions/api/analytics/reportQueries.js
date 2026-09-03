export async function resolveNamedQueries(queryMap = {}) {
  const entries = Object.entries(queryMap)
  const values = await Promise.all(entries.map(([, promise]) => promise))
  return Object.fromEntries(entries.map(([key], index) => [key, values[index]]))
}
