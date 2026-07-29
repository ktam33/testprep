import { NextRequest, NextResponse } from 'next/server';
import {
  getDb,
  getCategoryStats,
  getRecentTopicSeeds,
  persistGeneratedTest,
  claimPregeneratedTest,
} from '@/utils/db';
import { generateTest, GeneratedTestContent } from '@/utils/testGenerator';
import { triggerPregeneration } from '@/utils/pregenManager';
import { Section, SECTIONS } from '@/types';

// On-demand generation can take up to three model calls (generate, one retry, one review).
export const maxDuration = 300;

function isSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTIONS as string[]).includes(value);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('🔵 [GENERATE API] Request received');

  try {
    const { section, userId } = await request.json();

    if (!isSection(section)) {
      return NextResponse.json({ error: 'A valid section is required' }, { status: 400 });
    }
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDb();

    // 1. If a pre-generated test is waiting in this user's pool, hand it out immediately. It
    //    stays in the pool (still "available") until this attempt is submitted, so abandoning
    //    it leaves it reusable.
    const pregen = claimPregeneratedTest(db, userId, section);
    if (pregen) {
      const content = JSON.parse(pregen.content) as GeneratedTestContent;
      const attemptId = persistGeneratedTest(
        db,
        userId,
        section,
        content.passages,
        content.questions,
        pregen.id,
        content.topicLabels ?? [] // absent on pool entries generated before topic seeding
      );
      console.log(`✅ [GENERATE API] Served pre-generated ${section} test in ${Date.now() - startTime}ms (attemptId=${attemptId})`);
      void triggerPregeneration(); // refill the pool in the background
      return NextResponse.json({ attemptId, source: 'pregenerated' });
    }

    // 2. Pool empty — fall back to on-demand, adaptive generation (original behavior).
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ [GENERATE API] Missing OpenAI API key');
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
    }

    const categoryStats = getCategoryStats(db, userId, section);
    console.log(
      '🔵 [GENERATE API] On-demand generation. Category stats:',
      categoryStats.map((s) => `${s.categoryName}: ${s.correct}/${s.attempts}`).join(', ')
    );

    const recentTopics = getRecentTopicSeeds(db, userId, section);
    const { passages, questions, topicLabels } = await generateTest(section, categoryStats, recentTopics);
    const attemptId = persistGeneratedTest(db, userId, section, passages, questions, null, topicLabels);

    console.log(`✅ [GENERATE API] Generated on-demand in ${Date.now() - startTime}ms (attemptId=${attemptId})`);
    void triggerPregeneration(); // warm the pool so the next request can be instant
    return NextResponse.json({ attemptId, source: 'on-demand' });
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [GENERATE API] Error after ${totalTime}ms:`, error.message);
    return NextResponse.json({ error: 'Failed to generate test: ' + error.message }, { status: 500 });
  }
}
