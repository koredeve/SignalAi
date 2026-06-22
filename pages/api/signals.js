import { getSignalHistory, getActiveWeights, getContext, getAgentPerformance } from '../../lib/db';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.status(200).json({
    signals:     getSignalHistory(30),
    weights:     getActiveWeights(),
    context:     getContext(),
    performance: getAgentPerformance(),
  });
}
