import { query, queryOne } from '../db/client.js';
import { getAdapter } from '../adapters/registry.js';

// --- Types ---

export interface Meeting {
  id: string;
  blueprint_run_id?: string;
  title: string;
  status: string;
  participants: string[];
  rounds: number;
  consensus_rule: string;
  chairman_agent?: string;
  result?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingMessage {
  id: string;
  meeting_id: string;
  seq: number;
  agent_name: string;
  role: string;
  content: string;
  created_at: string;
}

export interface MeetingWithMessages extends Meeting {
  messages: MeetingMessage[];
}

export interface CreateMeetingDTO {
  title: string;
  blueprint_run_id?: string;
  participants: string[];
  rounds?: number;
  consensus_rule?: string;
  chairman_agent?: string;
}

// --- CRUD ---

export async function createMeeting(data: CreateMeetingDTO): Promise<Meeting> {
  const meeting = await queryOne<Meeting>(`
    INSERT INTO meetings (title, blueprint_run_id, participants, rounds, consensus_rule, chairman_agent)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING *
  `, [
    data.title,
    data.blueprint_run_id || null,
    JSON.stringify(data.participants),
    data.rounds ?? 3,
    data.consensus_rule ?? 'majority',
    data.chairman_agent || null,
  ]);
  if (!meeting) throw new Error('Failed to create meeting');
  return meeting;
}

export async function getMeeting(id: string): Promise<MeetingWithMessages | null> {
  const meeting = await queryOne<Meeting>('SELECT * FROM meetings WHERE id = $1', [id]);
  if (!meeting) return null;

  const messages = await query<MeetingMessage>(
    'SELECT * FROM meeting_messages WHERE meeting_id = $1 ORDER BY seq ASC', [id]
  );

  return { ...meeting, messages };
}

export async function listMeetings(): Promise<Meeting[]> {
  return query<Meeting>('SELECT * FROM meetings ORDER BY created_at DESC');
}

// --- Meeting Execution ---

export async function runMeeting(meetingId: string): Promise<MeetingWithMessages> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) throw new Error('Meeting not found');

  await query("UPDATE meetings SET status = 'running' WHERE id = $1", [meetingId]);
  const participants: string[] = meeting.participants;
  const rounds = meeting.rounds;
  const rule = meeting.consensus_rule;
  const chairman = meeting.chairman_agent;

  let seq = 0;

  // Try to use adapter for LLM-powered responses
  const adapter = await getAdapter('multica').catch(() => null);
  const canUseLLM = adapter && await adapter.ping().catch(() => false);

  for (let r = 1; r <= rounds; r++) {
    for (const agentName of participants) {
      seq++;
      const role = agentName === chairman ? 'chairman' : 'participant';

      // Build context from previous messages
      const previousMessages = await query<MeetingMessage>(
        'SELECT * FROM meeting_messages WHERE meeting_id = $1 ORDER BY seq ASC', [meetingId]
      );
      const context = previousMessages.map(m => `[${m.agent_name}]: ${m.content}`).join('\n');

      // Build prompt for this participant
      const isFirst = r === 1 && seq === 1;
      const prompt = isFirst
        ? `你正在参加一场关于"${meeting.title}"的会议。你的角色是"${role}"。请就议题发表你的专业看法。`
        : `会议当前讨论内容:\n${context.slice(0, 2000)}\n\n你(${agentName})作为${role}，请基于以上讨论继续发言，表达你的专业意见。`;

      let content: string;

      // Try LLM via adapter first, fall back to mock
      if (canUseLLM && adapter) {
        try {
          const task = await adapter.createTask({
            title: `会议发言: ${agentName} (第${r}轮)`,
            description: prompt,
            projectId: '',
            assigneeId: agentName,
          });
          content = `[${adapter.name}] 已提交观点 (task: ${task.id.slice(0, 8)}…)`;
        } catch {
          content = generateMockResponse(agentName, r, rounds, rule, prompt);
        }
      } else {
        content = generateMockResponse(agentName, r, rounds, rule, prompt);
      }

      await query(`
        INSERT INTO meeting_messages (meeting_id, seq, agent_name, role, content)
        VALUES ($1, $2, $3, $4, $5)
      `, [meetingId, seq, agentName, role, content]);
    }
  }

  // Collect all participant stances for consensus
  const allMessages = await query<MeetingMessage>(
    'SELECT * FROM meeting_messages WHERE meeting_id = $1 ORDER BY seq ASC', [meetingId]
  );

  // Count "同意" statements to determine consensus
  let consensus: string;
  if (rule === 'chairman' && chairman) {
    const chairmanMsgs = allMessages.filter(m => m.agent_name === chairman);
    const chairmanLast = chairmanMsgs[chairmanMsgs.length - 1];
    consensus = chairmanLast?.content.includes('同意')
      ? '达成共识（Chairman 决定）'
      : '未达成共识（Chairman 决定）';
  } else {
    // Count agreement signals across all participants
    const agreeCount = allMessages.filter(m => m.content.includes('同意')).length;
    const totalMessages = allMessages.length;
    const agreeRatio = totalMessages > 0 ? agreeCount / totalMessages : 0;

    if (rule === 'unanimous') {
      consensus = agreeCount >= participants.length * rounds
        ? '达成共识（全体一致）'
        : '未达成共识（非全体一致）';
    } else { // majority
      consensus = agreeRatio > 0.5
        ? `达成共识（多数同意）`
        : `未达成共识（未过半数）`;
    }
  }

  await query("UPDATE meetings SET status = 'completed', result = $1, updated_at = now() WHERE id = $2",
    [consensus, meetingId]);

  return getMeeting(meetingId) as Promise<MeetingWithMessages>;
}

function generateMockResponse(
  agentName: string, round: number, totalRounds: number,
  rule: string, context: string
): string {
  const stances = ['同意该方向。', '我认同这个方案。', '需要更多细节，但原则上同意。', '同意推进。'];

  if (round === totalRounds) {
    return `经过讨论，我${agentName}同意最终方案。`;
  }

  if (agentName.includes('PM') || agentName.includes('Manager')) {
    return `作为管理者，我${stances[Math.floor(Math.random() * stances.length)]}`;
  }
  if (agentName.includes('Dev') || agentName.includes('Developer')) {
    return `从实现角度，我${stances[Math.floor(Math.random() * stances.length)]}`;
  }

  return `Round ${round}: 我${stances[Math.floor(Math.random() * stances.length)]}`;
}
