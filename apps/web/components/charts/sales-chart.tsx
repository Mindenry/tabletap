'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTHB } from '@/lib/utils';
import type { SalesPoint } from '@/lib/types';

export function SalesChart({ data, height = 260 }: { data: SalesPoint[]; height?: number }) {
  const points = data.map((point) => ({
    ...point,
    label: point.bucket.slice(5).replace(' ', ' · '),
    value: Number(point.gross),
  }));

  if (points.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-line-strong text-[13px] text-muted">
        No settled bills in this period yet.
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b8532e" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#b8532e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2dbcd" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#726c5f', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: '#726c5f', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
            }
          />
          <Tooltip
            cursor={{ stroke: '#cfc6b4', strokeDasharray: '3 4' }}
            contentStyle={{
              background: '#fffdf9',
              border: '1px solid #e2dbcd',
              borderRadius: 8,
              fontSize: 12,
              boxShadow: '0 12px 30px -20px rgba(25,23,18,0.5)',
            }}
            formatter={(value) => [formatTHB(Number(value ?? 0)), 'Gross sales']}
            labelStyle={{ color: '#726c5f' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#b8532e"
            strokeWidth={2}
            fill="url(#sales-fill)"
            dot={false}
            activeDot={{ r: 3.5, fill: '#b8532e', stroke: '#fffdf9', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
