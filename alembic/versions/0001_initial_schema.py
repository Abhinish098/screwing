"""0001_initial_schema.py — Initial database schema for The Duel.

Creates:
  users, presence, challenges, games, game_rounds, player_game_state
"""

from alembic import op
import sqlalchemy as sa

# Migration identifiers
revision = "0001"
down_revision = None        # this is the base migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgcrypto for gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── users ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            google_uid   TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            email        TEXT,
            created_at   TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── presence ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS presence (
            user_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            is_online BOOLEAN DEFAULT true,
            last_seen TIMESTAMPTZ DEFAULT now(),
            in_game   BOOLEAN DEFAULT false
        )
    """)

    # ── challenges ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS challenges (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            challenger_id UUID REFERENCES users(id),
            challenged_id UUID REFERENCES users(id),
            status        TEXT DEFAULT 'pending',  -- pending | accepted | declined | expired
            created_at    TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── games ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS games (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            player1_id  UUID REFERENCES users(id),
            player2_id  UUID REFERENCES users(id),
            status      TEXT DEFAULT 'in_progress',  -- in_progress | finished
            winner_id   UUID REFERENCES users(id),
            round       INT DEFAULT 1,
            created_at  TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── game_rounds ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS game_rounds (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            game_id          UUID REFERENCES games(id) ON DELETE CASCADE,
            round_number     INT NOT NULL,
            player1_move     TEXT,   -- 'attack' | 'defend' | 'run' — NULL until submitted
            player2_move     TEXT,
            player1_hp_after INT,
            player2_hp_after INT,
            resolved         BOOLEAN DEFAULT false
        )
    """)

    # ── player_game_state ────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS player_game_state (
            game_id UUID REFERENCES games(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id),
            hp      INT DEFAULT 10,
            PRIMARY KEY (game_id, user_id)
        )
    """)

    # Useful indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_presence_online ON presence(is_online, in_game)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges(challenged_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_game_rounds_game ON game_rounds(game_id, round_number)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS player_game_state CASCADE")
    op.execute("DROP TABLE IF EXISTS game_rounds CASCADE")
    op.execute("DROP TABLE IF EXISTS games CASCADE")
    op.execute("DROP TABLE IF EXISTS challenges CASCADE")
    op.execute("DROP TABLE IF EXISTS presence CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
