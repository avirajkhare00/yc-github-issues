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
          justifyContent: 'space-between',
          background: '#0a0a0a',
          color: '#ededed',
          padding: '72px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 30, color: '#f97316', letterSpacing: 2 }}>
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

        <div style={{ display: 'flex', gap: 64, fontSize: 30 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 56, fontWeight: 700, color: '#4ade80' }}>{hiringCount}</span>
            <span style={{ color: '#a1a1aa' }}>repos at hiring companies</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 56, fontWeight: 700 }}>{companyCount}</span>
            <span style={{ color: '#a1a1aa' }}>YC companies</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
