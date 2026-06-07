export default function Loading() {
  return (
    <>
      <header className="toolbar">
        <div>
          <h2>กำลังโหลด</h2>
          <p>กำลังเตรียมข้อมูลจาก Google Sheet</p>
        </div>
      </header>
      <section className="content grid cards">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </section>
    </>
  );
}
