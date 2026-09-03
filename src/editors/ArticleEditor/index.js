import { createEditorDescriptor, editorTypes } from '../editorFramework'

export const ArticleEditor = createEditorDescriptor(editorTypes.ARTICLE, {
  title: 'Article Editor',
  workspace: 'Article Studio',
})
