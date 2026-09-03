import { createEditorDescriptor, editorTypes } from '../editorFramework'

export const ProjectEditor = createEditorDescriptor(editorTypes.PROJECT, {
  title: 'Project Editor',
  workspace: 'Project Studio',
})
