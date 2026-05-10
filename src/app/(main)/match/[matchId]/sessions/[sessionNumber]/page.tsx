import { SessionWorkspace } from "./session-workspace";

type Props = {
  params: Promise<{ matchId: string; sessionNumber: string }>;
};

export default async function SessionPage(props: Props) {
  const { matchId, sessionNumber } = await props.params;
  return <SessionWorkspace matchId={matchId} sessionNumber={sessionNumber} />;
}
