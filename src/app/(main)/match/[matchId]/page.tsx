import { MatchWorkspace } from "./match-workspace";

type Props = {
  params: Promise<{ matchId: string }>;
};

export default async function MatchRoomPage(props: Props) {
  const { matchId } = await props.params;
  return <MatchWorkspace matchId={matchId} />;
}
