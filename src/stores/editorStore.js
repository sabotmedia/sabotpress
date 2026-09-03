import { createStore } from './createStore'

export const EditorStore = createStore({
  activeEditor: '',
  selectedField: '',
  dirty: false,
  draft: null,
})

export function useEditorStore(selector) {
  return EditorStore.useStore(selector)
}
