import { MainDashboard } from "@/components/Dashboards";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <>
      <header className="toolbar main-program-toolbar">
        <div>
          <h2>หน้าหลัก</h2>
          <p>Main Program</p>
        </div>
      </header>
      <MainDashboard />
    </>
  );
}
