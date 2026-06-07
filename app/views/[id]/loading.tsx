export default function ViewLoading() {
  return (
    <>
      <header className="toolbar">
        <div>
          <h2>กำลังโหลด</h2>
          <p>กำลังดึงข้อมูลหน้านี้</p>
        </div>
      </header>
      <section className="content grid">
        <div className="skeleton-card" />
        <div className="panel skeleton-table" />
      </section>
    </>
  );
}
