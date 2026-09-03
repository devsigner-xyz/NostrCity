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

const GITHUB_REPOSITORY_URL = 'https://github.com/devsigner-xyz/NostrCity';

const VALUE_PILLS = [
  'landing.values.openSource',
  'landing.values.nonprofit',
  'landing.values.protocolFirst',
  'landing.values.nostrNative',
] as const;

const FEATURE_ITEMS = [
  {
    eyebrowKey: 'landing.features.generativeMap.eyebrow',
    titleKey: 'landing.features.generativeMap.title',
    bodyKey: 'landing.features.generativeMap.body',
  },
  {
    eyebrowKey: 'landing.features.identity.eyebrow',
    titleKey: 'landing.features.identity.title',
    bodyKey: 'landing.features.identity.body',
  },
  {
    eyebrowKey: 'landing.features.relays.eyebrow',
    titleKey: 'landing.features.relays.title',
    bodyKey: 'landing.features.relays.body',
  },
  {
    eyebrowKey: 'landing.features.feed.eyebrow',
    titleKey: 'landing.features.feed.title',
    bodyKey: 'landing.features.feed.body',
  },
  {
    eyebrowKey: 'landing.features.export.eyebrow',
    titleKey: 'landing.features.export.title',
    bodyKey: 'landing.features.export.body',
  },
  {
    eyebrowKey: 'landing.features.lab.eyebrow',
    titleKey: 'landing.features.lab.title',
    bodyKey: 'landing.features.lab.body',
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

const STACK_TAGS = [
  'landing.stack.tag.nostr',
  'landing.stack.tag.relays',
  'landing.stack.tag.nip07',
  'landing.stack.tag.nip46',
  'landing.stack.tag.webln',
  'landing.stack.tag.exports',
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

  const logoSrc = theme === 'dark' ? '/icon-dark-32x32.png' : '/icon-light-32x32.png';

  return (
    <div className="landing-shell" data-theme={theme}>
      <a className="skip-link" href="#main-content">{t('landing.nav.skipToContent')}</a>

      <header className="topbar">
        <a className="brand" href="#hero" aria-label={t('landing.brand.homeAria')}>
          <img className="brand-logo" src={logoSrc} width="32" height="32" alt={t('landing.brand.logoAlt')} />
          <span>Nostr City</span>
        </a>

        <nav className="topbar-links" aria-label={t('landing.nav.mainLinks')}>
          <a href={docsUrl}>{t('landing.nav.documentation')}</a>
          <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
            {t('landing.nav.github')}
          </a>
          <a href="#features">{t('landing.nav.features')}</a>
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
          <p className="kicker">{t('landing.hero.kicker')}</p>
          <h1>{t('landing.hero.title')}</h1>
          <p className="hero-lead">{t('landing.hero.body')}</p>

          <div className="hero-actions">
            <a className="app-link" href={appUrl}>{t('landing.hero.openApp')}</a>
            <a href="#como-funciona">{t('landing.hero.howItWorks')}</a>
            <a href={docsUrl}>{t('landing.hero.readDocs')}</a>
          </div>
        </section>

        <section className="value-strip" aria-label={t('landing.values.label')}>
          {VALUE_PILLS.map((valueKey) => (
            <p key={valueKey}>{t(valueKey)}</p>
          ))}
        </section>

        <section className="content feature-intro" id="features">
          <div className="section-copy">
            <p className="section-kicker">{t('landing.features.kicker')}</p>
            <h2>{t('landing.features.title')}</h2>
            <p>{t('landing.features.body')}</p>
          </div>

          <div className="feature-list" data-testid="landing-feature-list">
            {FEATURE_ITEMS.map((feature) => (
              <article className="feature-row" key={feature.titleKey}>
                <p className="feature-eyebrow">{t(feature.eyebrowKey)}</p>
                <div>
                  <h3>{t(feature.titleKey)}</h3>
                  <p>{t(feature.bodyKey)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="content how-section" id="como-funciona">
          <div className="section-copy">
            <p className="section-kicker">{t('landing.how.kicker')}</p>
            <h2>{t('landing.how.title')}</h2>
            <p>{t('landing.how.body')}</p>
          </div>

          <div className="steps">
            {HOW_STEPS.map((step, index) => (
              <article className="step-card" key={step.titleKey}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{t(step.titleKey)}</h3>
                <p>{t(step.bodyKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content stack-section" id="protocolo">
          <div className="section-copy">
            <p className="section-kicker">{t('landing.stack.kicker')}</p>
            <h2>{t('landing.stack.title')}</h2>
            <p>{t('landing.stack.body')}</p>
          </div>

          <div className="stack-tags" aria-label={t('landing.stack.tagsLabel')}>
            {STACK_TAGS.map((tagKey) => (
              <span key={tagKey}>{t(tagKey)}</span>
            ))}
          </div>
        </section>

        <section className="content philosophy-section" id="filosofia">
          <p className="section-kicker">{t('landing.philosophy.kicker')}</p>
          <h2>{t('landing.philosophy.title')}</h2>
          <p>{t('landing.philosophy.body')}</p>
          <p className="manifest">{t('landing.philosophy.manifesto')}</p>

          <div className="footer-cta">
            <a className="app-link" href={appUrl}>{t('landing.footer.openApp')}</a>
            <a href={docsUrl}>{t('landing.footer.readDocs')}</a>
            <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
              {t('landing.footer.viewRepo')}
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
