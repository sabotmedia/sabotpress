import { createStore } from './createStore'

export const MediaStore = createStore({
  assets: [],
  selectedAssetId: '',
  state: 'idle',
})

export function useMediaStore(selector) {
  return MediaStore.useStore(selector)
}
