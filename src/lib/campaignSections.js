export const CAMPAIGN_SECTION_DEFINITIONS = [
  { key: 'status', label: 'Status + countdown', nav: 'Status', title: 'Campaign status', description: 'Deadline, countdown, infrastructure status, or another live campaign condition.', editor: 'status' },
  { key: 'reporting', label: 'Reporting + context', nav: 'Reporting', title: 'Reporting and context', description: 'Sabot reporting and contextual resources connected to this campaign.', editor: 'resources' },
  { key: 'letters', label: 'Letters + resources', nav: 'Letters', title: 'Letters and resources', description: 'Public letters, templates, documents, PDFs, and other campaign resources.', editor: 'resources' },
  { key: 'act', label: 'Action center', nav: 'Act', title: 'Take action', description: 'Calls to action with buttons, links, and short explanations.', editor: 'actions' },
  { key: 'graphics', label: 'Campaign graphics', nav: 'Graphics', title: 'Campaign media kit', description: 'Share graphics, captions, alt text, and downloadable campaign media.', editor: 'graphics' },
  { key: 'updates', label: 'Campaign updates', nav: 'Updates', title: 'Campaign updates', description: 'A chronological campaign log with optional pinned updates.', editor: 'updates' },
  { key: 'timeline', label: 'Timeline', nav: 'Timeline', title: 'Campaign timeline', description: 'Dated events explaining how the campaign developed.', editor: 'timeline' },
  { key: 'coverage', label: 'Press + coverage', nav: 'Coverage', title: 'Coverage and statements', description: 'Editorially moderated coverage plus optional automated feed discovery.', editor: 'coverage' },
  { key: 'sources', label: 'Primary sources', nav: 'Sources', title: 'Primary sources', description: 'Source documents, receipts, verification links, and notes.', editor: 'sources' },
  { key: 'faq', label: 'FAQ', nav: 'FAQ', title: 'Frequently asked questions', description: 'Reader-facing questions and answers.', editor: 'faq' },
  { key: 'translations', label: 'Translations', nav: 'Translations', title: 'Translations', description: 'Links to translated versions of campaign material.', editor: 'translations' },
  { key: 'signatories', label: 'Signatories', nav: 'Signers', title: 'Signatories', description: 'People and organizations signing a public statement or letter.', editor: 'signatories' },
  { key: 'social', label: 'Social feeds', nav: 'Social', title: 'Social updates', description: 'Curated or automated social posts from configured accounts.', editor: 'social' },
  { key: 'donate', label: 'Donation destination', nav: 'Donate', title: 'Donate', description: 'A verified fundraiser or direct-aid destination with explanatory context.', editor: 'donation' },
  { key: 'socialArchive', label: 'Social media archive', nav: 'Social archive', title: 'Social media archive', description: 'Preserved campaign social posts independent of the originating platform.', editor: 'correspondence' },
  { key: 'dispatches', label: 'Field dispatches', nav: 'Dispatches', title: 'Dispatches', description: 'Approved text, photo, audio, or video dispatches from campaign contributors.', editor: 'correspondence' },
  { key: 'questions', label: 'Public questions', nav: 'Ask', title: 'Ask a question', description: 'Moderated reader questions for campaign participants or correspondents.', editor: 'correspondence' },
  { key: 'benefit', label: 'Benefit toolkit', nav: 'Organize', title: 'Organize a benefit', description: 'A toolkit for supporters organizing benefit events or fundraisers.', editor: 'benefit' },
]

export const CAMPAIGN_SECTION_KEYS = CAMPAIGN_SECTION_DEFINITIONS.map((section) => section.key)
export const CAMPAIGN_SECTION_LABELS = Object.fromEntries(CAMPAIGN_SECTION_DEFINITIONS.map((section) => [section.key, section.label]))
export const CAMPAIGN_SECTION_META = Object.fromEntries(CAMPAIGN_SECTION_DEFINITIONS.map((section) => [section.key, { nav: section.nav, title: section.title, description: section.description, editor: section.editor }]))

export function campaignSectionDefinition(key) {
  return CAMPAIGN_SECTION_DEFINITIONS.find((section) => section.key === key) || null
}

export function normalizeCampaignSectionOrder(value) {
  const requested = Array.isArray(value) ? value.map((key) => String(key || '').trim()).filter((key) => CAMPAIGN_SECTION_KEYS.includes(key)) : []
  return [...new Set([...requested, ...CAMPAIGN_SECTION_KEYS])]
}
