import { ImageResponse } from 'next/og';
import { getCompanyMetadata } from './utils/repoUtils';

export const alt = "First PR — land your first PR at a YC startup that's hiring";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Social card for link previews. Built from repos.meta.json so the numbers on
 * the card are the real ones rather than marketing claims that drift.
 */
export default async function Image() {
  const companies = Object.values(getCompanyMetadata());
  const hiringCount = companies.filter(company => company.is_hiring).length;
  const companyCount = new Set(companies.map(company => company.name)).size;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#ededed',
          // X and LinkedIn overlay a title bar across the bottom of the card,
          // so the lower ~120px is reserved and nothing meaningful sits there.
          padding: '72px 72px 150px 72px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 28, color: '#f97316', letterSpacing: 2 }}>
            FIRST PR
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.1,
              marginTop: 28,
              maxWidth: 980
            }}
          >
            Land your first PR at a YC startup that&apos;s hiring
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 32,
              color: '#a1a1aa',
              marginTop: 28,
              maxWidth: 940
            }}
          >
            Beginner-friendly issues — unassigned, actively maintained, and open right now.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginTop: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 28,
              background: '#14532d',
              color: '#bbf7d0',
              padding: '10px 22px',
              borderRadius: 999
            }}
          >
            {hiringCount} repos hiring now
          </div>

          <div style={{ display: 'flex', fontSize: 28, color: '#a1a1aa' }}>
            {companyCount} YC companies
          </div>

          <div style={{ display: 'flex', fontSize: 28, color: '#f97316' }}>
            Start contributing →
          </div>
        </div>
      </div>
    ),
    size
  );
}
