const CURRENT_INFO_COPY_VERSION = 'software-defaults-v1'
const INFO_COPY_VERSIONS = { contact: CURRENT_INFO_COPY_VERSION, security: CURRENT_INFO_COPY_VERSION }
export const publicInfoCopy = {
  about: { eyebrow: 'about', title: 'About this publication', body: 'Add your publication description in site settings.' },
  contact: { eyebrow: 'contact', title: 'Contact', body: 'Add contact information in site settings.' },
  submit: { eyebrow: 'submit', title: 'Submit work', body: 'Add submission guidance in site settings.' },
  support: { eyebrow: 'support', title: 'Support', body: 'Add support information in site settings.' },
  security: { eyebrow: 'security', title: 'Security', body: 'Add security and source-protection guidance in site settings.' },
}
export function getPublicInfoCopy(page) { return publicInfoCopy?.[page] || {} }
export function getPublicInfoField(page, part, fallbackField = '') { return publicInfoCopy?.[page]?.[part] || (fallbackField ? publicInfoCopy?.[page]?.[fallbackField] : '') || '' }
export { CURRENT_INFO_COPY_VERSION, INFO_COPY_VERSIONS }
