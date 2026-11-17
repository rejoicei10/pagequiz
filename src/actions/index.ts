import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { quizActions } from './quiz'

export const actions: Record<string, ActionHandler<Env>> = {
  ...quizActions,
}
