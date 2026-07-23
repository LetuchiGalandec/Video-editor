import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { YoutubeUploadCard } from './youtube-upload-card';
import { ApiService } from '../../core/api.service';
import type { AuthStatus, Playlist } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';

class ApiStub {
  status: AuthStatus = { configured: true, authorized: true, user: { name: 'My Channel' } };
  playlists: Playlist[] = [
    { id: 'pl-1', title: 'Clips' },
    { id: 'pl-2', title: 'Music' },
  ];
  authStatus() {
    return of(this.status);
  }
  listPlaylists() {
    return of(this.playlists);
  }
  signOut() {
    return of(undefined);
  }
  startUpload() {
    return of({ jobId: 'job-1' });
  }
}

class JobEventsStub {
  watch() {
    return { job: signal(undefined), dispose: () => {} };
  }
}

describe('YoutubeUploadCard', () => {
  let fixture: ComponentFixture<YoutubeUploadCard>;
  let api: ApiStub;

  const render = async (status?: Partial<AuthStatus>): Promise<void> => {
    if (status) {
      api.status = { ...api.status, ...status };
    }
    fixture = TestBed.createComponent(YoutubeUploadCard);
    fixture.componentRef.setInput('clipId', 'clip-1');
    fixture.componentRef.setInput('defaultTitle', 'Me at the zoo');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [YoutubeUploadCard],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: JobEventsService, useValue: new JobEventsStub() },
      ],
    });
  });

  it('shows the connect button when not authorized', async () => {
    await render({ authorized: false, user: undefined });
    expect(text()).toContain('Sign in with YouTube');
    expect(fixture.nativeElement.querySelector('.playlist-select')).toBeNull();
  });

  it('shows the not-configured guidance when OAuth is unset', async () => {
    await render({ configured: false, authorized: false });
    expect(text()).toContain("isn't configured");
  });

  it('shows the signed-in identity and a sign-out control when authorized', async () => {
    await render();
    expect(text()).toContain('My Channel');
    expect(fixture.nativeElement.querySelector('.link-btn')?.textContent).toContain('Sign out');
  });

  it('lists the account playlists plus a create-new option', async () => {
    await render();
    const select = fixture.nativeElement.querySelector('.playlist-select') as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent?.trim());
    expect(options).toContain('Clips');
    expect(options).toContain('Music');
    expect(options.some((o) => o?.includes('Create new playlist'))).toBe(true);
    expect(options[0]).toContain("Don't add to a playlist");
  });

  it('reveals a name field only when "create new playlist" is chosen', async () => {
    await render();
    expect(fixture.nativeElement.querySelector('input[placeholder="New playlist name"]')).toBeNull();
    const component = fixture.componentInstance as unknown as {
      selectedPlaylist: { set: (v: string) => void };
    };
    component.selectedPlaylist.set('__new__');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector('input[placeholder="New playlist name"]'),
    ).not.toBeNull();
  });
});
