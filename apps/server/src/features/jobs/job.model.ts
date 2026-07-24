export type JobType = 'download' | 'clip' | 'upload' | 'ingest';

export type JobState = 'queued' | 'running' | 'done' | 'error';

export interface JobResult {
  videoId?: string;
  clipId?: string;
  youtubeVideoId?: string;
  watchUrl?: string;
}

export interface Job {
  id: string;
  type: JobType;
  state: JobState;
  progress: number;
  error?: string;
  result?: JobResult;
  createdAt: number;
  updatedAt: number;
}

export type JobPatch = Partial<
  Pick<Job, 'state' | 'progress' | 'error' | 'result'>
>;

export const TERMINAL_STATES: readonly JobState[] = ['done', 'error'];

export const isTerminal = (state: JobState): boolean =>
  TERMINAL_STATES.includes(state);
