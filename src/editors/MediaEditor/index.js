import { createEditorDescriptor, editorTypes } from '../editorFramework'

export const MediaEditor = createEditorDescriptor(editorTypes.MEDIA, {
  title: 'Media Editor',
  workspace: 'Media Studio',
})
