-- 000015_renumber_windows.up.sql
-- Renumber windows sequentially (1..N) per branch to eliminate any existing gaps
DO $$
DECLARE
    b RECORD;
BEGIN
    FOR b IN SELECT DISTINCT branch_id FROM windows LOOP
        -- Step 1: Temporarily shift numbers to prevent UNIQUE (branch_id, number) collisions
        UPDATE windows 
        SET number = number + 100000 
        WHERE branch_id = b.branch_id;

        -- Step 2: Reassign clean sequential 1..N order
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY number ASC) AS new_num
            FROM windows
            WHERE branch_id = b.branch_id
        )
        UPDATE windows w
        SET number = o.new_num
        FROM ordered o
        WHERE w.id = o.id;
    END LOOP;
END $$;
