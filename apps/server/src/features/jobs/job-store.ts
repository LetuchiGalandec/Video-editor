import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Observable, ReplaySubject } from 'rxjs';
import { isTerminal } from './job.model';
import type { Job, JobPatch, JobType } from './job.model';

const clampProgress = (value: number): number => Math.min(100, Math.max(0, value));

@Injectable()
export class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly subjects = new Map<string, ReplaySubject<Job>>();

  create(type: JobType): Job {
    const now = Date.now();
    const job: Job = {
      id: randomUUID(),
      type,
      state: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    const subject = new ReplaySubject<Job>(1);
    subject.next(job);
    this.subjects.set(job.id, subject);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  patch(id: string, patch: JobPatch): Job {
    const current = this.jobs.get(id);
    if (!current) {
      throw new Error(`Unknown job: ${id}`);
    }
    if (isTerminal(current.state) && patch.state && patch.state !== current.state) {
      throw new Error(`Job ${id} is already ${current.state}`);
    }
    const updated: Job = {
      ...current,
      ...patch,
      progress: clampProgress(patch.progress ?? current.progress),
      updatedAt: Date.now(),
    };
    this.jobs.set(id, updated);
    const subject = this.subjects.get(id);
    subject?.next(updated);
    if (subject && isTerminal(updated.state)) {
      subject.complete();
    }
    return updated;
  }

  watch(id: string): Observable<Job> {
    const subject = this.subjects.get(id);
    if (!subject) {
      throw new Error(`Unknown job: ${id}`);
    }
    return subject.asObservable();
  }

  remove(id: string): void {
    this.subjects.get(id)?.complete();
    this.subjects.delete(id);
    this.jobs.delete(id);
  }
}
