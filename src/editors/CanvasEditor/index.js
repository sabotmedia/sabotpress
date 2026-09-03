import { createEditorDescriptor, editorTypes } from '../editorFramework'

export const CanvasEditor = createEditorDescriptor(editorTypes.CANVAS, {
  title: 'Canvas Editor',
  workspace: 'Canvas',
})
