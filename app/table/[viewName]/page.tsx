import { notFound, redirect } from "next/navigation";
import { PRIMARY_VIEWS } from "@/lib/config";

type TableCompatPageProps = {
  params: Promise<{ viewName: string }>;
};

export default async function TableCompatPage({ params }: TableCompatPageProps) {
  const { viewName } = await params;
  const decoded = decodeURIComponent(viewName);
  const view = PRIMARY_VIEWS.find(item => item.name === decoded);
  if (!view) notFound();
  redirect(`/views/${view.id}`);
}
