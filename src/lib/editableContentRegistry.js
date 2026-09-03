export const editableContentRegistry = {
  nav: [
    { id: 'archive', labelField: 'nav.archive.label', hrefField: 'nav.archive.href', defaultLabel: 'Archive', defaultHref: '/archive' },
    { id: 'feeds', labelField: 'nav.feeds.label', hrefField: 'nav.feeds.href', defaultLabel: 'Feeds', defaultHref: '/feeds' },
    { id: 'about', labelField: 'nav.about.label', hrefField: 'nav.about.href', defaultLabel: 'About', defaultHref: '/about' },
  ],
  footer: {
    eyebrow: {
      field: 'footer.brand.eyebrow',
      defaultText: 'independent media / archive / public publication',
    },
    title: {
      field: 'footer.brand.title',
      defaultText: 'SabotPress',
    },
    body: {
      field: 'footer.brand.body',
      defaultText:
        'An independent media publication for recent writing, dispatches, print material, and archive work. The public site is for reading. The tools stay backstage.',
    },
    bottom: {
      field: 'footer.bottom.body',
      defaultText: 'Read online, search the archive, or open a print-friendly article view.',
    },
    sections: [
      {
        id: 'site',
        titleField: 'footer.site.title',
        defaultTitle: 'Site',
        links: [
          { id: 'home', labelField: 'footer.site.home.label', hrefField: 'footer.site.home.href', defaultLabel: 'Home', defaultHref: '/' },
          { id: 'archive', labelField: 'footer.site.archive.label', hrefField: 'footer.site.archive.href', defaultLabel: 'Archive', defaultHref: '/archive' },
          { id: 'feeds', labelField: 'footer.site.feeds.label', hrefField: 'footer.site.feeds.href', defaultLabel: 'Feeds / RSS', defaultHref: '/feeds' },
          { id: 'about', labelField: 'footer.site.about.label', hrefField: 'footer.site.about.href', defaultLabel: 'About', defaultHref: '/about' },
          { id: 'security', labelField: 'footer.site.security.label', hrefField: 'footer.site.security.href', defaultLabel: 'Security', defaultHref: '/security' },
          { id: 'contact', labelField: 'footer.site.contact.label', hrefField: 'footer.site.contact.href', defaultLabel: 'Contact', defaultHref: '/contact' },
          { id: 'submit', labelField: 'footer.site.submit.label', hrefField: 'footer.site.submit.href', defaultLabel: 'Submit work', defaultHref: '/submit' },
          { id: 'support', labelField: 'footer.site.support.label', hrefField: 'footer.site.support.href', defaultLabel: 'Support', defaultHref: '/support' },
        ],
      },
      {
        id: 'formats',
        titleField: 'footer.formats.title',
        defaultTitle: 'Formats',
        links: [
          { id: 'articles', labelField: 'footer.formats.articles.label', hrefField: 'footer.formats.articles.href', defaultLabel: 'Articles', defaultHref: '/archive?format=article' },
          { id: 'podcasts', labelField: 'footer.formats.podcasts.label', hrefField: 'footer.formats.podcasts.href', defaultLabel: 'Podcasts', defaultHref: '/archive?format=podcast' },
          { id: 'comics', labelField: 'footer.formats.comics.label', hrefField: 'footer.formats.comics.href', defaultLabel: 'Comics', defaultHref: '/archive?format=comic' },
          { id: 'zines', labelField: 'footer.formats.zines.label', hrefField: 'footer.formats.zines.href', defaultLabel: 'Zines', defaultHref: '/archive?format=zine' },
          { id: 'newsletters', labelField: 'footer.formats.newsletters.label', hrefField: 'footer.formats.newsletters.href', defaultLabel: 'Newsletters', defaultHref: '/archive?format=newsletter' },
        ],
      },
    ],
  },
  home: {
    loadingTitle: {
      field: 'home.loading.title',
      defaultText: 'Loading recent posts',
    },
    loadingBody: {
      field: 'home.loading.body',
      defaultText: 'Pulling together the latest published material.',
    },
    emptyTitle: {
      field: 'home.empty.title',
      defaultText: 'No recent pieces available',
    },
    emptyBody: {
      field: 'home.empty.body',
      defaultText: 'Publish native entries or confirm the imported archive is loaded.',
    },
    errorTitle: {
      field: 'home.error.title',
      defaultText: 'Recent posts unavailable',
    },
    nextLabel: {
      field: 'home.next.label',
      defaultText: 'Next',
    },
  },
  archive: {
    eyebrow: {
      field: 'archive.hero.eyebrow',
      defaultText: 'archive / browse / publication',
    },
    title: {
      field: 'archive.hero.title',
      defaultText: 'Archive',
    },
    body: {
      field: 'archive.hero.body',
      defaultText:
        'Search and filter the full SabotPress archive by project, format, and keyword.',
    },
    countLabel: {
      field: 'archive.hero.countLabel',
      defaultText: 'pieces',
    },
    searchLabel: {
      field: 'archive.search.label',
      defaultText: 'Search the archive',
    },
    searchPlaceholder: {
      field: 'archive.search.placeholder',
      defaultText: 'Title, project, excerpt, format...',
    },
    projectLabel: {
      field: 'archive.project.label',
      defaultText: 'Project',
    },
    allProjectsLabel: {
      field: 'archive.project.allLabel',
      defaultText: 'All projects',
    },
    formatLabel: {
      field: 'archive.format.label',
      defaultText: 'Format',
    },
    allFormatsLabel: {
      field: 'archive.format.allLabel',
      defaultText: 'All formats',
    },
    recentLabel: {
      field: 'archive.results.recentLabel',
      defaultText: 'recent archive',
    },
    emptyTitle: {
      field: 'archive.empty.title',
      defaultText: 'No archive results',
    },
    emptyBody: {
      field: 'archive.empty.body',
      defaultText: 'Try a different filter, a broader search term, or clear the project filter.',
    },
    loadMoreLabel: {
      field: 'archive.loadMore.label',
      defaultText: 'Load more',
    },
    clearFiltersLabel: {
      field: 'archive.clearFilters.label',
      defaultText: 'Clear filters',
    },
    readLabel: {
      field: 'archive.card.readLabel',
      defaultText: 'Read',
    },
    printLabel: {
      field: 'archive.card.printLabel',
      defaultText: 'Print',
    },
  },
  notFound: {
    eyebrow: {
      field: 'notFound.eyebrow',
      defaultText: '404',
    },
    pageTitle: {
      field: 'notFound.page.title',
      defaultText: 'Page not found',
    },
    pageBody: {
      field: 'notFound.page.body',
      defaultText: 'That page does not exist, moved, or was never published.',
    },
    postTitle: {
      field: 'notFound.post.title',
      defaultText: 'Post not found',
    },
    postBody: {
      field: 'notFound.post.body',
      defaultText: 'This post is not published, does not exist, or is still saving.',
    },
    projectTitle: {
      field: 'notFound.project.title',
      defaultText: 'Project not found',
    },
    projectBody: {
      field: 'notFound.project.body',
      defaultText: 'That project archive does not exist or is not public.',
    },
    homeLabel: {
      field: 'notFound.actions.homeLabel',
      defaultText: 'Home',
    },
    archiveLabel: {
      field: 'notFound.actions.archiveLabel',
      defaultText: 'Back to archive',
    },
    projectsLabel: {
      field: 'notFound.actions.projectsLabel',
      defaultText: 'Back to projects',
    },
  },
  login: {
    title: {
      field: 'login.title',
      defaultText: 'Editor Login',
    },
    body: {
      field: 'login.body',
      defaultText: 'Enter the admin token to access backstage tools and live editing.',
    },
    tokenLabel: {
      field: 'login.tokenLabel',
      defaultText: 'Admin token',
    },
    emptyError: {
      field: 'login.emptyError',
      defaultText: 'Enter the admin token.',
    },
    rejectedError: {
      field: 'login.rejectedError',
      defaultText: 'That token was not accepted.',
    },
    submitLabel: {
      field: 'login.submitLabel',
      defaultText: 'Log in',
    },
    checkingLabel: {
      field: 'login.checkingLabel',
      defaultText: 'Checking...',
    },
  },
  about: {
    eyebrow: {
      field: 'info.about.eyebrow',
      defaultText: 'about / publication',
    },
    title: {
      field: 'info.about.title',
      defaultText: 'About this publication',
    },
    body: {
      field: 'info.about.body',
      defaultText:
        'Add a description of your publication, collective, project, or archive here.',
    },
    actions: [
      { id: 'archive', labelField: 'info.about.actions.archive.label', hrefField: 'info.about.actions.archive.href', defaultLabel: 'Browse archive', defaultHref: '/archive' },
    ],
  },
  contact: {
    eyebrow: {
      field: 'info.contact.eyebrow',
      defaultText: 'contact / tips / correspondence',
    },
    title: {
      field: 'info.contact.title',
      defaultText: 'Contact',
    },
    body: {
      field: 'info.contact.body',
      defaultText:
        'Send tips, corrections, project notes, questions, and correspondence through the publication channels. Include context, links, and a way to follow up when a reply is needed.',
    },
    actions: [
      { id: 'submit', labelField: 'info.contact.actions.submit.label', hrefField: 'info.contact.actions.submit.href', defaultLabel: 'Submit work', defaultHref: '/submit' },
      { id: 'support', labelField: 'info.contact.actions.support.label', hrefField: 'info.contact.actions.support.href', defaultLabel: 'Support', defaultHref: '/support' },
    ],
  },
  submit: {
    eyebrow: {
      field: 'info.submit.eyebrow',
      defaultText: 'submit / pitches / contributions',
    },
    title: {
      field: 'info.submit.title',
      defaultText: 'Submit',
    },
    body: {
      field: 'info.submit.body',
      defaultText:
        'Send pitches, essays, reports, comics, art, zine ideas, or project leads that fit the publication. Include a short description, the intended format, and how to reach you.',
    },
    actions: [
      { id: 'articles', labelField: 'info.submit.actions.articles.label', hrefField: 'info.submit.actions.articles.href', defaultLabel: 'Read articles', defaultHref: '/archive?format=article' },
      { id: 'contact', labelField: 'info.submit.actions.contact.label', hrefField: 'info.submit.actions.contact.href', defaultLabel: 'Contact', defaultHref: '/contact' },
    ],
  },
  support: {
    eyebrow: {
      field: 'info.support.eyebrow',
      defaultText: 'support / sustain / share',
    },
    title: {
      field: 'info.support.title',
      defaultText: 'Support',
    },
    body: {
      field: 'info.support.body',
      defaultText:
        'Add the ways readers can support this publication here.',
    },
    actions: [
      { id: 'zines', labelField: 'info.support.actions.zines.label', hrefField: 'info.support.actions.zines.href', defaultLabel: 'Print material', defaultHref: '/archive?format=zine' },
      { id: 'archive', labelField: 'info.support.actions.archive.label', hrefField: 'info.support.actions.archive.href', defaultLabel: 'Browse archive', defaultHref: '/archive' },
    ],
  },
  security: {
    eyebrow: {
      field: 'info.security.eyebrow',
      defaultText: 'security / encryption / contact',
    },
    title: {
      field: 'info.security.title',
      defaultText: 'Security',
    },
    body: {
      field: 'info.security.body',
      defaultText:
        `Some people contact publications with information that may carry personal, legal, professional, or political risk.

We take that seriously.

This page explains how to contact us, what different tools can and cannot protect, and how to send encrypted email using our public OpenPGP key.

No security tool is magic. The safest method depends on what you are sending, who might be watching, and what consequences you are trying to avoid.

## Quick guide

For general contact, normal email is fine.

For sensitive tips, documents, organizing information, legal concerns, or anything that could put someone at risk, use OpenPGP encryption.

For anonymity, encryption alone is not enough. Use Tor Browser, a separate email identity, and avoid including identifying details.

## Contact addresses

General:


Submissions:


Tips:


Encrypted or sensitive contact:


Support:


Press:


## What we use

Our public email addresses are routed through privacy-conscious infrastructure, and our primary mailbox is hosted with Riseup.

Riseup is a communications collective that provides email and other tools for people and groups working toward social change.

Learn more:
https://riseup.net

Ordinary email is not end-to-end encrypted by default. Riseup is a better home than most corporate email providers, but if you send an unencrypted email, the contents are still not protected the same way an encrypted message would be.

If your message is sensitive, use OpenPGP.

## Our OpenPGP key

Add your publication OpenPGP key here if you use one.

Identity:
Add your publication identity here.

Fingerprint:
Add your OpenPGP fingerprint here.

Key ID:
Add your key ID here.

Download our public key:


Before sending sensitive information, verify that the fingerprint above matches the key you imported.

## What OpenPGP does

OpenPGP encrypts the contents of your message so only someone with the matching private key can read it.

It can protect:
- the body of your email
- attached files, if encrypted
- signed messages proving a message came from a specific key

It does not automatically hide:
- who contacted us
- when contact happened
- your IP address
- subject lines, depending on your email tool
- the fact that communication occurred

Learn more about OpenPGP:
https://www.openpgp.org

EFF guide to PGP:
https://ssd.eff.org/module/how-use-pgp

## How to send us encrypted email

1. Install an OpenPGP tool.

Good options include:

Mailvelope:
https://mailvelope.com

Thunderbird:
https://www.thunderbird.net

Kleopatra:
https://www.openpgp.org/software/kleopatra/

GnuPG:
https://gnupg.org

OpenKeychain for Android:
https://www.openkeychain.org

Proton Mail:
https://proton.me/mail

2. Download our public key.



3. Import the key into your OpenPGP tool.

4. Verify the fingerprint.

Make sure the fingerprint shown by your tool matches:

3166 FF41 1CC8 71E7 2D15 344C AC26 8457 855E 57BA

5. Write your message to:



6. Enable encryption before sending.

If your tool gives you a warning that the message is not encrypted, stop and check your setup before sending sensitive information.

## Proton Mail

If you already use Proton Mail, you can contact us from Proton.

Proton is a reasonable option for many people, especially if you are not ready to set up separate encryption tools.

Important limit:
A Proton-to-Proton message is end-to-end encrypted inside Proton. A Proton message to a non-Proton mailbox is not automatically end-to-end encrypted unless you use OpenPGP or Proton's encrypted message features.

For stronger protection, import and verify our OpenPGP key before sending sensitive material.

Proton Mail:
https://proton.me/mail

Proton guide to PGP:
https://proton.me/support/how-to-use-pgp

## Tor Browser

Tor Browser helps hide your IP address and makes it harder for websites and network observers to know where you are connecting from.

Tor is useful if you do not want your normal internet connection associated with contacting us.

Tor does not make unsafe behavior safe. If you log into your personal email, include your name, or send identifying documents, Tor cannot remove that information.

Tor Browser:
https://www.torproject.org

EFF guide to Tor:
https://ssd.eff.org/module/how-use-tor

## Safer tip workflow

If you are sending something sensitive:

1. Think about what you are trying to protect.
2. Avoid using a work, school, or personal device if that creates risk.
3. Use Tor Browser if anonymity matters.
4. Use a separate email identity that is not tied to your real name.
5. Encrypt your message with our OpenPGP key.
6. Remove metadata from files when possible.
7. Do not include unnecessary identifying details.
8. Tell us what safety concerns you have.

## File metadata

Documents, images, audio, and video may contain metadata.

Metadata can include:
- author names
- device information
- GPS location
- timestamps
- editing history
- software used

Before sending sensitive files, consider removing metadata.

EFF surveillance self-defense:
https://ssd.eff.org

ExifTool:
https://exiftool.org

MAT2 metadata cleaner:
https://0xacab.org/jvoisin/mat2

## What to send

For tips, include what you safely can:

- what happened
- when it happened
- where it happened
- who was involved
- how you know
- what documents, images, audio, or witnesses support it
- what parts are confirmed
- what parts are uncertain
- what risks we should understand before publishing

Do not send identifying information you do not want us to have.

## What we will never ask for

We will never ask you to:
- send us your private key
- send passwords by email
- turn off encryption for convenience
- identify yourself if anonymity is necessary
- reveal sources unnecessarily
- expose other people without consent

## If you are unsure

If you are unsure what level of security you need, contact us first with a low-risk message.

Do not include sensitive details in the first message.

You can write something like:

"I have a sensitive tip and need help choosing a safer way to send it."

Use:
`,
    },
    actions: [
      { id: 'pgp', labelField: 'info.security.actions.pgp.label', hrefField: 'info.security.actions.pgp.href', defaultLabel: 'Download PGP key', defaultHref: '/keys/info-sabot-media.asc' },
      { id: 'contact', labelField: 'info.security.actions.contact.label', hrefField: 'info.security.actions.contact.href', defaultLabel: 'Contact', defaultHref: '/contact' },
    ],
  },
}

export function getEditablePage(pageKey) {
  return editableContentRegistry[pageKey] || editableContentRegistry.about
}
