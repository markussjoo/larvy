'use client';
import { useEffect, useState } from 'react';
import { readDemoFile } from './lesson-files';
import type { LessonMedia } from './lesson-format';

function parseExternalEmbed(rawUrl: string): {
  embedType: 'iframe' | 'audio' | 'video' | 'link';
  src: string;
  provider?: string;
} {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname;

    // 1. YouTube
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) {
        return { embedType: 'iframe', src: `https://www.youtube.com/embed/${v}`, provider: 'YouTube' };
      }
      const shortMatch = path.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,20})/);
      if (shortMatch) {
        return { embedType: 'iframe', src: `https://www.youtube.com/embed/${shortMatch[1]}`, provider: 'YouTube' };
      }
    }
    if (host === 'youtu.be') {
      const id = path.slice(1).split('/')[0];
      if (id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
        return { embedType: 'iframe', src: `https://www.youtube.com/embed/${id}`, provider: 'YouTube' };
      }
    }

    // 2. Vimeo
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = path.match(/\/(?:video\/)?(\d+)/);
      if (m) {
        return { embedType: 'iframe', src: `https://player.vimeo.com/video/${m[1]}`, provider: 'Vimeo' };
      }
    }

    // 3. SoundCloud
    if (host === 'soundcloud.com') {
      return {
        embedType: 'iframe',
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(rawUrl)}&color=%237c3aed&auto_play=false`,
        provider: 'SoundCloud'
      };
    }

    // 4. Spotify (track, episode, show, playlist)
    if (host === 'open.spotify.com') {
      const m = path.match(/^\/(track|episode|show|playlist|album)\/([a-zA-Z0-9]+)/);
      if (m) {
        return {
          embedType: 'iframe',
          src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
          provider: 'Spotify'
        };
      }
    }

    // 5. Sveriges Radio
    if (host === 'sverigesradio.se') {
      const m = path.match(/\/avsnitt\/(\d+)/) || path.match(/\/artikel\/(\d+)/);
      if (m) {
        return {
          embedType: 'iframe',
          src: `https://sverigesradio.se/embed/publication/${m[1]}`,
          provider: 'Sveriges Radio'
        };
      }
    }

    // 6. Direct audio or video files by extension
    if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(path)) {
      return { embedType: 'audio', src: rawUrl };
    }
    if (/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(path)) {
      return { embedType: 'video', src: rawUrl };
    }

    return { embedType: 'link', src: rawUrl };
  } catch {
    return { embedType: 'link', src: rawUrl };
  }
}

export default function LessonMediaPlayer({ media }: { media: LessonMedia }) {
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');
  const [showIframeFallback, setShowIframeFallback] = useState(false);

  useEffect(() => {
    if (!media.file?.demo) return;
    let disposed = false;
    let localUrl = '';
    setBlobUrl('');
    setError('');
    readDemoFile(media.file.id).then(
      blob => {
        if (disposed) return;
        localUrl = URL.createObjectURL(blob);
        setBlobUrl(localUrl);
      },
      e => {
        if (!disposed) setError(e instanceof Error ? e.message : 'Mediafilen kunde inte laddas.');
      }
    );
    return () => {
      disposed = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [media.file?.id, media.file?.demo]);

  const fileSrc = media.file
    ? media.file.demo
      ? blobUrl
      : '/api/lesson-files/' + media.file.id
    : media.url || '';

  const icon = media.kind === 'audio' ? '🔊' : media.kind === 'video' ? '🎬' : '🔗';
  const badgeLabel =
    media.kind === 'audio' ? 'Ljudspår' : media.kind === 'video' ? 'Filmspår' : 'Webblänk / Media';

  return (
    <div
      className="lesson-media-player"
      style={{
        margin: '16px 0',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid rgba(139, 92, 246, 0.28)',
        background: 'rgba(139, 92, 246, 0.06)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true" style={{ fontSize: 18 }}>{icon}</span>
          <strong style={{ fontSize: 15 }}>{media.title}</strong>
          <span className="badge" style={{ fontSize: 11 }}>{badgeLabel}</span>
        </div>
        {media.url && (
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, textDecoration: 'underline' }}
          >
            Öppna i ny flik ↗
          </a>
        )}
      </div>

      {media.kind === 'audio' && (
        media.file && media.file.demo && !fileSrc && !error ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Förbereder ljudspår…</p>
        ) : (
          <audio
            controls
            preload="metadata"
            src={fileSrc}
            style={{ width: '100%', maxWidth: 540, display: 'block' }}
          >
            Din webbläsare stödjer inte ljuduppspelning.
          </audio>
        )
      )}

      {media.kind === 'video' && (
        media.file && media.file.demo && !fileSrc && !error ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Förbereder filmspår…</p>
        ) : (
          <video
            controls
            preload="metadata"
            src={fileSrc}
            style={{ width: '100%', maxHeight: 440, borderRadius: 8, background: '#000', display: 'block' }}
          >
            Din webbläsare stödjer inte videouppspelning.
          </video>
        )
      )}

      {media.kind === 'embed' && media.url && (() => {
        const parsed = parseExternalEmbed(media.url);
        if (parsed.embedType === 'audio') {
          return (
            <audio controls preload="metadata" src={parsed.src} style={{ width: '100%', maxWidth: 540, display: 'block' }} />
          );
        }
        if (parsed.embedType === 'video') {
          return (
            <video controls preload="metadata" src={parsed.src} style={{ width: '100%', maxHeight: 440, borderRadius: 8, background: '#000', display: 'block' }} />
          );
        }
        if (parsed.embedType === 'iframe') {
          const isAudioEmbed = parsed.provider === 'SoundCloud' || parsed.provider === 'Spotify' || parsed.provider === 'Sveriges Radio';
          return (
            <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
              <iframe
                src={parsed.src}
                title={media.title}
                width="100%"
                height={isAudioEmbed ? '166' : '380'}
                style={{ border: 0, display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }
        // Generic external webpage with audio/video: allow in-browser playback attempt or direct open
        return (
          <div>
            {showIframeFallback ? (
              <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden', background: '#0f172a', marginTop: 8 }}>
                <iframe
                  src={parsed.src}
                  title={media.title}
                  width="100%"
                  height="380"
                  style={{ border: 0, display: 'block' }}
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="light"
                  style={{ fontSize: 13, padding: '6px 12px' }}
                  onClick={() => setShowIframeFallback(true)}
                >
                  ▶ Spela upp direkt i webbläsaren
                </button>
                <a
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13 }}
                >
                  {media.url} ↗
                </a>
              </div>
            )}
          </div>
        );
      })()}

      {error && <p role="alert" className="error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
