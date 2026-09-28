import { useCallback, useEffect, useState } from 'react';
import type { DailyRecord } from '../../shared/types';
import { api } from '../api';
import { Card, EmptyState, SegmentedControl, Spinner } from '../components/ui';
import { useApp } from '../state/AppContext';

type Range = '7' | '30';

function Deviation({ actual, target }: { actual: number; target: number }) {
  const delta = Math.round((actual - target) * 10) / 10;
  const tone = Math.abs(delta) <= target * 0.1 ? 'text-emerald-600' : 'text-amber-600';
  return (
    <span className={`tabular-nums ${tone}`}>
      {Math.round(actual)}
      <span className="text-[10px]">
        {' '}
        ({delta > 0 ? '+' : ''}
        {delta})
      </span>
    </span>
  );
}

export function HistoryPage() {
  const { notify } = useApp();
  const [range, setRange] = useState<Range>('7');
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<DailyRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.listRecords(Number(range));
      setRecords(response.records);
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取历史失败');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [notify, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickLatest = async (date: string) => {
    try {
      const response = await api.getRecord(date);
      setLatest(response.record);
    } catch {
      setLatest(null);
    }
  };

  const summary = records.length > 0 ? (
    <Card>
      <p className="text-xs text-slate-500">
        最近 {records.length} 天平均：体重{' '}
        {(records.reduce((total, record) => total + record.weightKg, 0) / records.length).toFixed(1)} kg · 热量{' '}
        {Math.round(records.reduce((total, record) => total + record.actualCalories, 0) / records.length)} kcal · 蛋白{' '}
        {Math.round(records.reduce((total, record) => total + record.actualProtein, 0) / records.length)} g
      </p>
    </Card>
  ) : null;

  return (
    <div className="space-y-3 px-4 pb-4">
      <SegmentedControl<Range>
        value={range}
        onChange={setRange}
        options={[
          { value: '7', label: '最近 7 天' },
          { value: '30', label: '最近 30 天' },
        ]}
      />

      {summary}

      {loading ? (
        <Spinner label="正在读取历史…" />
      ) : records.length === 0 ? (
        <Card>
          <EmptyState>还没有历史记录，去首页记录今天吧</EmptyState>
        </Card>
      ) : (
        <ul className="space-y-2">
          {records.map((record) => (
            <li key={record.date}>
              <button type="button" onClick={() => void pickLatest(record.date)} className="w-full text-left">
                <Card>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-slate-800">{record.date}</span>
                    <span className="text-[11px] text-slate-400">
                      {record.weightKg} kg · {record.trainingDay ? '训练日' : '非训练日'}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-4 gap-1 text-[11px]">
                    <div>
                      <div className="text-slate-400">热量</div>
                      <div className="tabular-nums text-slate-700">
                        {Math.round(record.actualCalories)}
                        <span className="text-[10px] text-slate-400"> / {Math.round(record.targetCalories)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">碳水</div>
                      <Deviation actual={record.actualCarbs} target={record.targetCarbs} />
                    </div>
                    <div>
                      <div className="text-slate-400">蛋白质</div>
                      <Deviation actual={record.actualProtein} target={record.targetProtein} />
                    </div>
                    <div>
                      <div className="text-slate-400">脂肪</div>
                      <Deviation actual={record.actualFat} target={record.targetFat} />
                    </div>
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}

      {latest ? (
        <Card className="!bg-slate-50">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">{latest.date} 详情</p>
            <button type="button" className="text-[11px] text-slate-400" onClick={() => setLatest(null)}>
              关闭
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
            目标 {latest.targetCarbs}C / {latest.targetProtein}P / {latest.targetFat}F · 实际 {latest.actualCarbs}C /{' '}
            {latest.actualProtein}P / {latest.actualFat}F
          </p>
        </Card>
      ) : null}
    </div>
  );
}
