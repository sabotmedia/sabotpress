export const editorTypes = Object.freeze({
  ARTICLE: 'ArticleEditor',
  PUBLICATION: 'PublicationEditor',
  CANVAS: 'CanvasEditor',
  PRINT_ASSET: 'PrintAssetEditor',
  PROJECT: 'ProjectEditor',
  MEDIA: 'MediaEditor',
  TAXONOMY: 'TaxonomyEditor',
})

export const sharedEditorControls = Object.freeze([
  'TitleControl',
  'SlugControl',
  'StatusControl',
  'AssetPickerControl',
  'TaxonomyControl',
  'PublishScheduleControl',
])

export function createEditorDescriptor(type, overrides = {}) {
  return {
    type,
    title: overrides.title || type,
    model: overrides.model || null,
    controls: Array.isArray(overrides.controls) ? overrides.controls : sharedEditorControls,
    workspace: overrides.workspace || '',
  }
}
