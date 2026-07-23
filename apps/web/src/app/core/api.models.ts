export type JobType = 'download' | 'clip' | 'upload';

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

export interface VideoMeta {
  videoId: string;
  title: string;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export type ClipMode = 'accurate' | 'fast';

export const isTerminal = (state: JobState): boolean => state === 'done' || state === 'error';
