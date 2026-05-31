-- Backstop against double-booking the same table at the same exact slot.
-- NULL tableId rows are exempt (SQLite treats NULLs as distinct).
-- CreateIndex
CREATE UNIQUE INDEX "Reservation_tableId_date_time_key" ON "Reservation"("tableId", "date", "time");
