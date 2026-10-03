import { describe, expect, it } from 'vitest';
import { botLabelData, departmentNameFor } from '../src/office/identity.js';
import { visualForAgent } from '../src/office/visuals.js';
import { agentView, department } from './fixtures.js';

const engineering = department('Engineering');

describe('department identity', () => {
  it('resolves a department name from the list the UI already has', () => {
    expect(departmentNameFor(engineering.id, [engineering])).toBe('Engineering');
    expect(departmentNameFor(undefined, [engineering])).toBeUndefined();
    expect(departmentNameFor('ghost', [engineering])).toBeUndefined();
  });

  it('includes the department in the bot label data', () => {
    const agent = agentView({ id: 'agent_1', name: 'Ada', departmentId: engineering.id });
    const label = botLabelData(agent, visualForAgent(agent), [engineering]);
    expect(label.name).toBe('Ada');
    expect(label.department).toBe('Engineering');
  });

  it('omits the department for an unassigned agent', () => {
    const agent = agentView({ id: 'agent_1', name: 'Ada' });
    const label = botLabelData(agent, visualForAgent(agent), [engineering]);
    expect(label.department).toBeUndefined();
  });
});
