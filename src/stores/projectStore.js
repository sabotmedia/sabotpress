import { createStore } from './createStore'

export const ProjectStore = createStore({
  projects: [],
  selectedProjectSlug: '',
})

export function useProjectStore(selector) {
  return ProjectStore.useStore(selector)
}
