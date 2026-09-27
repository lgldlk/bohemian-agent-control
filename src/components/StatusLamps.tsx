import { useTranslation } from 'react-i18next';
import type { BoardAgentStatus, CardStatus } from '@/lib/boardStatus';

const LAMP_CLASS: Partial<Record<BoardAgentStatus, string>> = {
  working: 'is-working',
  blocked: 'is-blocked',
  idle: 'is-idle',
  starting: 'is-starting',
  running: 'is-running',
  pending: 'is-starting',
  completed: 'is-completed',
  deleted: 'is-deleted',
  error: 'is-error',
};

/** One task status. An open terminal is not shown as running. */
export default function StatusLamps({ status }: { status: CardStatus }) {
  const { t } = useTranslation();
  const phase = status.task;
  return (
    <span className={`tl-task-card__lamp ${LAMP_CLASS[phase] ?? 'is-completed'}`} title={t(`status.${phase}`)}>
      <i />
      {t(`status.${phase}`)}
    </span>
  );
}
