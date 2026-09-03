export function buildPublicConfigPayload(input) {
  const text = input?.text || {}
  const styles = input?.styles || {}
  const blocks = input?.blocks || {}

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    publicSite: {
      text,
      styles,
      blocks,
    },
  }
}

export function buildChangedOnlyPayload(input) {
  const text = input?.text || {}
  const styles = input?.styles || {}
  const blocks = input?.blocks || {}

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    changedOnly: true,
    publicSite: {
      text,
      styles,
      blocks,
    },
  }
}
