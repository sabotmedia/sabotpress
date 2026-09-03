import { Link } from 'react-router-dom'
import { EditableText } from './EditableText'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import { getConfiguredBlock, getConfiguredText } from '../lib/publicConfig'
import { adminRoutes } from '../routing/routes'

function WorkflowStep({ title, body, action, to }) {
  return (
    <article className="admin-workflow-step">
      <h3>{title}</h3>
      <p>{body}</p>
      <Link className="button button--primary" to={to}>{action}</Link>
    </article>
  )
}

export function AdminWorkflowCard() {
  const resolvedConfig = useResolvedConfig()
  const block = getConfiguredBlock(resolvedConfig, 'admin.workflow')

  const title1 = getConfiguredText(resolvedConfig, block?.step1TitleField || 'admin.workflow.step1Title', '1. Review imported archive')
  const body1 = getConfiguredText(resolvedConfig, block?.step1BodyField || 'admin.workflow.step1Body', 'Start in the review queue when a piece needs cleanup, project reassignment, excerpt repair, or feature decisions.')
  const action1 = getConfiguredText(resolvedConfig, block?.step1ActionField || 'admin.workflow.step1Action', 'open review queue')

  const title2 = getConfiguredText(resolvedConfig, block?.step2TitleField || 'admin.workflow.step2Title', '2. Patch metadata with overrides')
  const body2 = getConfiguredText(resolvedConfig, block?.step2BodyField || 'admin.workflow.step2Body', 'Use override-ready snippets when imported entries need fixes before deeper native management exists.')
  const action2 = getConfiguredText(resolvedConfig, block?.step2ActionField || 'admin.workflow.step2Action', 'open overrides')

  const title3 = getConfiguredText(resolvedConfig, block?.step3TitleField || 'admin.workflow.step3Title', '3. Enrich podcasts')
  const body3 = getConfiguredText(resolvedConfig, block?.step3BodyField || 'admin.workflow.step3Body', 'Fill summaries, transcript excerpts, and source notes for podcast entries so they present well publicly.')
  const action3 = getConfiguredText(resolvedConfig, block?.step3ActionField || 'admin.workflow.step3Action', 'open podcast bridge')

  const title4 = getConfiguredText(resolvedConfig, block?.step4TitleField || 'admin.workflow.step4Title', '4. Publish native content')
  const body4 = getConfiguredText(resolvedConfig, block?.step4BodyField || 'admin.workflow.step4Body', 'Create internal native entries for updates, dispatches, and public blocks that should render on live public routes.')
  const action4 = getConfiguredText(resolvedConfig, block?.step4ActionField || 'admin.workflow.step4Action', 'open native bridge')

  const title5 = getConfiguredText(resolvedConfig, block?.step5TitleField || 'admin.workflow.step5Title', '5. Verify public output')
  const body5 = getConfiguredText(resolvedConfig, block?.step5BodyField || 'admin.workflow.step5Body', 'Check the live updates route and homepage native highlights to confirm published content is rendering correctly.')
  const action5 = getConfiguredText(resolvedConfig, block?.step5ActionField || 'admin.workflow.step5Action', 'open public updates')

  const title6 = getConfiguredText(resolvedConfig, block?.step6TitleField || 'admin.workflow.step6Title', '6. Tune public shell')
  const body6 = getConfiguredText(resolvedConfig, block?.step6BodyField || 'admin.workflow.step6Body', 'Use public config controls when site copy, headings, and public-facing structure need adjustment.')
  const action6 = getConfiguredText(resolvedConfig, block?.step6ActionField || 'admin.workflow.step6Action', 'open public draft')

  return (
    <section className="admin-workflow-card">
      <EditableText as="div" className="admin-workflow-card__eyebrow" field={block?.eyebrowField || 'admin.workflow.eyebrow'}>
        editorial workflow
      </EditableText>
      <EditableText as="h2" field={block?.titleField || 'admin.workflow.title'}>
        Editorial Workflow
      </EditableText>
      <EditableText as="div" className="admin-workflow-card__description" field={block?.descriptionField || 'admin.workflow.description'} multiline>
        Move through archive cleanup, overrides, podcast enrichment, native publishing, and public rendering without relying on memory.
      </EditableText>

      <div className="admin-workflow-card__grid">
        <WorkflowStep title={title1} body={body1} action={action1} to={adminRoutes.qa} />
        <WorkflowStep title={title2} body={body2} action={action2} to={adminRoutes.posts} />
        <WorkflowStep title={title3} body={body3} action={action3} to={adminRoutes.podcasts} />
        <WorkflowStep title={title4} body={body4} action={action4} to={adminRoutes.nativeBridge} />
        <WorkflowStep title={title5} body={body5} action={action5} to="/updates" />
        <WorkflowStep title={title6} body={body6} action={action6} to={adminRoutes.liveEditor} />
      </div>
    </section>
  )
}
