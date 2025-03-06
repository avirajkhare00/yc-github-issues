import { NextResponse } from 'next/server';
import { getRepositories } from '@/app/utils/repoUtils';

export async function GET() {
  try {
    const repositories = getRepositories();
    return NextResponse.json({ repositories });
  } catch (error) {
    console.error('Error getting repositories:', error);
    return NextResponse.json(
      { error: 'Failed to get repositories' },
      { status: 500 }
    );
  }
}
