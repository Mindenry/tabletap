'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTHB } from '@/lib/utils';
import type { SalesPoint } from '@/lib/types';

export function SalesChart({ data, height = 260 }: { data: SalesPoint[]; height?: number }) {
  const points = data.map((point) => ({
    ...point,
    label: point.bucket.endsWith(' 00:00')
      ? point.bucket.slice(5, 10).replace('-', '/')
      : point.bucket.slice(5).replace(' ', ' · '),
    value: Number(point.gross),
  }));

  if (points.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center border border-dashed border-line-strong text-[12px] text-muted"
      >
        No settled bills in this period yet.
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-muted)', fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            minTickGap={26}
          />
          <YAxis
            tick={{ fill: 'var(--color-muted)', fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : String(value)
            }
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '3 4' }}
            contentStyle={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-line)',
              borderRadius: 6,
              fontSize: 11.5,
              boxShadow: 'var(--shadow-overlay)',
            }}
            formatter={(value) => [formatTHB(Number(value ?? 0)), 'Gross']}
            labelStyle={{ color: 'var(--color-muted)' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-brand)"
            strokeWidth={1.6}
            fill="url(#sales-fill)"
            dot={false}
            activeDot={{
              r: 3,
              fill: 'var(--color-brand)',
              stroke: 'var(--color-surface-raised)',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
