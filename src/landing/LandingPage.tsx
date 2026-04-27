import { useEffect, useState } from 'react';
import { resolvePublicAppUrl } from '@/site/app-url';
import { resolvePublicDocsUrl } from '@/site/docs-url';
import { useI18n } from '@/i18n/useI18n';
import { UI_SETTINGS_STORAGE_KEY } from '@/nostr/ui-settings';
import {
  SITE_THEME_CHANGE_EVENT,
  SITE_THEME_MEDIA_QUERY,
  resolveSiteTheme,
  saveSiteThemePreference,
  type SiteTheme,
} from '@/site/theme-preference';

const MAP_PRESET_BY_THEME: Record<SiteTheme, 'Nostr City Light' | 'Nostr City Dark'> = {
  light: 'Nostr City Light',
  dark: 'Nostr City Dark',
};

const GITHUB_REPOSITORY_URL = 'https://github.com/devsigner-xyz/NostrCity';

const HERO_MARKERS = [
  {
    label: '01',
    titleKey: 'landing.hero.card.spatial.title',
    bodyKey: 'landing.hero.card.spatial.body',
  },
  {
    label: '02',
    titleKey: 'landing.hero.card.social.title',
    bodyKey: 'landing.hero.card.social.body',
  },
  {
    label: '03',
    titleKey: 'landing.hero.card.lab.title',
    bodyKey: 'landing.hero.card.lab.body',
  },
] as const;

const HOW_STEPS = [
  {
    titleKey: 'landing.how.step1.title',
    bodyKey: 'landing.how.step1.body',
  },
  {
    titleKey: 'landing.how.step2.title',
    bodyKey: 'landing.how.step2.body',
  },
  {
    titleKey: 'landing.how.step3.title',
    bodyKey: 'landing.how.step3.body',
  },
] as const;

const FEATURE_DISTRICTS = [
  {
    titleKey: 'landing.features.generativeCity.title',
    bodyKey: 'landing.features.generativeCity.body',
  },
  {
    titleKey: 'landing.features.overlay.title',
    bodyKey: 'landing.features.overlay.body',
  },
  {
    titleKey: 'landing.features.relays.title',
    bodyKey: 'landing.features.relays.body',
  },
  {
    titleKey: 'landing.features.export.title',
    bodyKey: 'landing.features.export.body',
  },
] as const;

const MAP_LEGEND_ITEMS = [
  { className: 'water', labelKey: 'landing.mapPreview.legend.water' },
  { className: 'park', labelKey: 'landing.mapPreview.legend.park' },
  { className: 'roads', labelKey: 'landing.mapPreview.legend.roads' },
  { className: 'social', labelKey: 'landing.mapPreview.legend.social' },
] as const;

export default function LandingPage() {
  const appUrl = resolvePublicAppUrl();
  const docsUrl = resolvePublicDocsUrl();
  const { t } = useI18n();
  const [theme, setTheme] = useState<SiteTheme>(() => resolveSiteTheme());

  useEffect(() => {
    const syncTheme = (event?: Event): void => {
      if (event instanceof StorageEvent && event.key && event.key !== UI_SETTINGS_STORAGE_KEY) {
        return;
      }

      setTheme(resolveSiteTheme());
    };

    window.addEventListener('storage', syncTheme);
    window.addEventListener(SITE_THEME_CHANGE_EVENT, syncTheme);

    const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia(SITE_THEME_MEDIA_QUERY) : null;
    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', syncTheme);
      } else {
        mediaQuery.addListener(syncTheme);
      }
    }

    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener(SITE_THEME_CHANGE_EVENT, syncTheme);

      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', syncTheme);
        } else {
          mediaQuery.removeListener(syncTheme);
        }
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;

    const iconHref = theme === 'dark' ? '/icon-dark-32x32.png' : '/icon-light-32x32.png';
    const iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/png';
    iconLink.href = iconHref;
    if (!iconLink.parentElement) {
      document.head.appendChild(iconLink);
    }
  }, [theme]);

  const selectTheme = (nextTheme: SiteTheme): void => {
    setTheme(saveSiteThemePreference(nextTheme));
  };

  const logoSrc = theme === 'dark' ? '/logo-v2-dark.png' : '/logo-v2-light.png';
  const activePreset = MAP_PRESET_BY_THEME[theme];

  return (
    <div className="landing-shell" data-theme={theme}>
      <a className="skip-link" href="#main-content">{t('landing.nav.skipToContent')}</a>
      <header className="topbar">
        <a className="brand" href="#hero" aria-label={t('landing.brand.homeAria')}>
          <img className="brand-logo" src={logoSrc} width="1536" height="1024" alt={t('landing.brand.logoAlt')} />
          <span>Nostr City</span>
        </a>

        <nav className="topbar-links" aria-label={t('landing.nav.mainLinks')}>
          <a href={docsUrl}>{t('landing.nav.documentation')}</a>
          <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
            {t('landing.nav.github')}
          </a>
          <a href="#features">
            {t('landing.nav.features')}
          </a>
          <div className="theme-toggle" role="group" aria-label={t('landing.theme.label')}>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => selectTheme('light')}>
              {t('landing.theme.light')}
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => selectTheme('dark')}>
              {t('landing.theme.dark')}
            </button>
          </div>
          <a className="app-link" href={appUrl}>{t('landing.nav.openApp')}</a>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="hero" id="hero">
          <div className="hero-copy">
            <p className="kicker">{t('landing.hero.kicker')}</p>
            <h1>{t('landing.hero.title')}</h1>
            <p>{t('landing.hero.body')}</p>

            <div className="hero-actions">
              <a className="app-link" href={appUrl}>{t('landing.hero.openApp')}</a>
              <a href="#como-funciona">
                {t('landing.hero.howItWorks')}
              </a>
            </div>

            <div className="hero-grid" role="list" aria-label={t('landing.hero.markerList')}>
              {HERO_MARKERS.map((marker) => (
                <article key={marker.label} role="listitem">
                  <span>{marker.label}</span>
                  <p className="marker-title">{t(marker.titleKey)}</p>
                  <p>{t(marker.bodyKey)}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="map-preview-card" aria-labelledby="landing-map-preview-title">
            <div className="map-preview-heading">
              <p>{t('landing.mapPreview.activePreset')}</p>
              <h2 id="landing-map-preview-title" data-active-preset={activePreset}>{activePreset}</h2>
            </div>

            <div
              className="map-preview"
              data-testid="landing-map-preview"
              role="img"
              aria-label={t('landing.mapPreview.aria', { preset: activePreset })}
            >
              <span className="map-water" aria-hidden="true" />
              <span className="map-park map-park-a" aria-hidden="true" />
              <span className="map-park map-park-b" aria-hidden="true" />
              <span className="map-road map-road-main" aria-hidden="true" />
              <span className="map-road map-road-cross" aria-hidden="true" />
              <span className="map-road map-road-arc" aria-hidden="true" />
              <span className="map-block map-block-a" aria-hidden="true" />
              <span className="map-block map-block-b" aria-hidden="true" />
              <span className="map-block map-block-c" aria-hidden="true" />
              <span className="map-node map-node-a" aria-hidden="true" />
              <span className="map-node map-node-b" aria-hidden="true" />
              <span className="map-node map-node-c" aria-hidden="true" />
            </div>

            <div className="map-legend" role="list" aria-label={t('landing.mapPreview.legendLabel')}>
              {MAP_LEGEND_ITEMS.map((item) => (
                <span key={item.className} className={`legend-item legend-${item.className}`} role="listitem">
                  <span aria-hidden="true" />
                  {t(item.labelKey)}
                </span>
              ))}
            </div>
          </aside>
        </section>

        <section className="content atlas-story" id="que-es">
          <div>
            <p className="section-kicker">{t('landing.whatIs.kicker')}</p>
            <h2>{t('landing.whatIs.title')}</h2>
            <p>{t('landing.whatIs.body')}</p>
          </div>

          <div className="story-route" aria-hidden="true">
            <span>npub</span>
            <span />
            <span>relays</span>
            <span />
            <span>city</span>
          </div>
        </section>

        <section className="content" id="como-funciona">
          <p className="section-kicker">{t('landing.how.kicker')}</p>
          <h2>{t('landing.how.title')}</h2>
          <div className="steps route-steps">
            {HOW_STEPS.map((step, index) => (
              <article className="card route-card" key={step.titleKey}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{t(step.titleKey)}</h3>
                <p>{t(step.bodyKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content" id="features">
          <p className="section-kicker">{t('landing.features.kicker')}</p>
          <h2>{t('landing.features.title')}</h2>
          <div className="features district-grid">
            {FEATURE_DISTRICTS.map((feature) => (
              <article className="card district-card" key={feature.titleKey}>
                <span className="district-glyph" aria-hidden="true" />
                <h3>{t(feature.titleKey)}</h3>
                <p>{t(feature.bodyKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content nostr-native" id="nostr-native">
          <div className="nostr-native-copy">
            <p className="section-kicker">{t('landing.nostrNative.kicker')}</p>
            <h2>{t('landing.nostrNative.title')}</h2>
            <p>{t('landing.nostrNative.body')}</p>
          </div>

          <div className="features">
            <article className="card">
              <h3>{t('landing.nostrNative.stack.title')}</h3>
              <p>{t('landing.nostrNative.stack.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.nostrNative.protocol.title')}</h3>
              <p>{t('landing.nostrNative.protocol.body')}</p>
            </article>
          </div>
        </section>

        <section className="content" id="filosofia">
          <h2>{t('landing.philosophy.title')}</h2>
          <p>{t('landing.philosophy.body')}</p>

          <p className="manifest">{t('landing.philosophy.manifesto')}</p>

          <div className="footer-cta">
            <a className="app-link" href={appUrl}>{t('landing.footer.openApp')}</a>
            <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
              {t('landing.footer.viewRepo')}
            </a>
            <a href={docsUrl}>{t('landing.footer.readDocs')}</a>
          </div>
        </section>
      </main>
    </div>
  );
}
