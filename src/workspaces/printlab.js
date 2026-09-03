import { createWorkspaceDescriptor, workspaceTypes } from './workspaceFramework'

export const PrintlabWorkspace = createWorkspaceDescriptor('printlab', {
  title: workspaceTypes.PRINTLAB,
  route: '/wp-admin/printlab',
  stores: ['PrintStore', 'PublicationStore', 'MediaStore'],
  editors: ['PrintAssetEditor', 'ArticleEditor'],
})
