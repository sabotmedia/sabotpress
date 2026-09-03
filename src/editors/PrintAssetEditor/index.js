import { createEditorDescriptor, editorTypes } from '../editorFramework'

export const PrintAssetEditor = createEditorDescriptor(editorTypes.PRINT_ASSET, {
  title: 'Print Asset Editor',
  workspace: 'Printlab',
})
