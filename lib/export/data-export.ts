/**
 * ============================================================================
 * 數據匯出模組 (Data Export Module)
 * ============================================================================
 *
 * 提供 CSV / Excel 兩種格式的動作數據匯出功能，
 * 供學術單位（如成大、台體大）進行臨床研究使用。
 *
 * 支援：
 * 1. 單次訓練逐幀數據匯出 (CSV)
 * 2. 單次訓練摘要報告匯出 (Excel-compatible CSV with headers)
 * 3. 批量多次訓練數據匯出
 */

import type { BiomechanicsMetrics } from '../analysis/biomechanics-engine'

// ============================================================================
// CSV 导出
// ============================================================================

/** 逐幀 CSV 表頭 */
const FRAME_CSV_HEADERS = [
  'frame_index',
  'timestamp_ms',
  // Phase 1 基礎指標 (醫療級雙軌數據: Filtered & Raw)
  'elbow_rom_deg',
  'elbow_rom_raw',
  'trunk_stability_deg',
  'trunk_stability_raw',
  'velocity',
  'velocity_raw',
  // Phase 2 核心指標
  'core_stability_angle_deg',
  'shoulder_angular_vel_deg_s',
  'elbow_angular_vel_deg_s',
  'wrist_angular_vel_deg_s',
  'tremor_detected',
  'tremor_frequency_hz',
  'tremor_severity',
  'compensation_type',
  'compensation_severity',
  // 場域資訊
  'subject_locked',
  'subject_confidence',
  'posture_correction_deg',
  'is_hunched',
  'is_tilted',
  'is_release_frame'
]

/**
 * 將逐幀 BiomechanicsMetrics 陣列匯出為 CSV 字串
 * @param frames 幀數據陣列
 * @param startTimestamp session 開始時間（毫秒）
 * @returns CSV 格式字串
 */
export function exportFramesToCSV(
  frames: BiomechanicsMetrics[],
  startTimestamp: number = 0
): string {
  const rows: string[] = [FRAME_CSV_HEADERS.join(',')]

  frames.forEach((frame, index) => {
    const row = [
      index,
      startTimestamp > 0 ? startTimestamp + Math.round(index * (1000 / 30)) : index * 33, // ~30fps
      frame.elbowROM ?? '',
      frame.elbowROM_raw ?? '',
      frame.trunkStability ?? '',
      frame.trunkStability_raw ?? '',
      frame.velocity ?? '',
      frame.velocity_raw ?? '',
      frame.coreStabilityAngle ?? '',
      frame.coreStabilityAngle_raw ?? '',
      frame.shoulderAngularVel ?? '',
      frame.elbowAngularVel ?? '',
      frame.wristAngularVel ?? '',
      frame.tremorDetected ? 1 : 0,
      frame.tremorFrequency ?? '',
      frame.tremorSeverity ?? '',
      frame.compensationType ?? '',
      frame.compensationSeverity ?? 0,
      frame.subjectLocked ? 1 : 0,
      frame.subjectConfidence ?? '',
      frame.postureCorrection ?? 0,
      frame.isHunched ? '1' : '0',
      frame.isTilted ? '1' : '0',
      frame.isReleaseFrame ? '1' : '0'
    ]
    rows.push(row.map(v => `"${v}"`).join(','))
  })

  // 添加 BOM 以便 Excel 正確識別 UTF-8 編碼
  return '\uFEFF' + rows.join('\n')
}


// ============================================================================
// 摘要报告导出
// ============================================================================

/** 摘要 CSV 表頭 */
const SUMMARY_CSV_HEADERS = [
  'session_id',
  'elder_id',
  'elder_name',
  'session_date',
  'duration_seconds',
  'total_frames',
  // Phase 1
  'avg_elbow_rom',
  'max_elbow_rom',
  'min_elbow_rom',
  'avg_trunk_stability',
  'avg_velocity',
  'stable_ratio_pct',
  // Phase 2
  'avg_core_stability_angle',
  'avg_shoulder_angular_vel',
  'avg_elbow_angular_vel',
  'avg_wrist_angular_vel',
  'tremor_detected_ratio_pct',
  'tremor_avg_frequency_hz',
  'compensation_detected_ratio_pct',
  'compensation_types',
  'posture_correction_avg_deg',
]

export interface SessionSummary {
  sessionId: string
  elderId: string
  elderName: string
  sessionDate: string
  durationSeconds: number
  metrics: any // metricsPayload from BocciaCam
  frameCount: number
}

/**
 * 將訓練摘要匯出為 CSV 字串
 */
export function exportSessionSummaryToCSV(session: SessionSummary): string {
  const m = session.metrics
  const rows: string[] = [SUMMARY_CSV_HEADERS.join(',')]

  const row = [
    session.sessionId,
    session.elderId,
    session.elderName,
    session.sessionDate,
    session.durationSeconds,
    session.frameCount,
    m.avg_rom ?? m.elbow_rom ?? '',
    m.max_rom ?? '',
    m.min_rom ?? '',
    m.avg_trunk_tilt ?? m.trunk_stability ?? '',
    m.avg_velocity ?? '',
    m.stable_ratio ?? '',
    m.core_stability_angle ?? '',
    m.avg_shoulder_angular_vel ?? '',
    m.avg_elbow_angular_vel ?? '',
    m.avg_wrist_angular_vel ?? '',
    m.tremor_detected_ratio ?? '',
    m.tremor_avg_frequency ?? '',
    m.compensation_detected_ratio ?? '',
    Array.isArray(m.compensation_types) ? m.compensation_types.join(';') : '',
    m.posture_correction_avg ?? '',
  ]

  rows.push(row.map(v => `"${v}"`).join(','))
  return '\uFEFF' + rows.join('\n')
}


/**
 * 批量匯出多個訓練摘要
 */
export function exportBatchSummaryToCSV(sessions: SessionSummary[]): string {
  const rows: string[] = [SUMMARY_CSV_HEADERS.join(',')]

  for (const session of sessions) {
    const m = session.metrics
    const row = [
      session.sessionId,
      session.elderId,
      session.elderName,
      session.sessionDate,
      session.durationSeconds,
      session.frameCount,
      m.avg_rom ?? m.elbow_rom ?? '',
      m.max_rom ?? '',
      m.min_rom ?? '',
      m.avg_trunk_tilt ?? m.trunk_stability ?? '',
      m.avg_velocity ?? '',
      m.stable_ratio ?? '',
      m.core_stability_angle ?? '',
      m.avg_shoulder_angular_vel ?? '',
      m.avg_elbow_angular_vel ?? '',
      m.avg_wrist_angular_vel ?? '',
      m.tremor_detected_ratio ?? '',
      m.tremor_avg_frequency ?? '',
      m.compensation_detected_ratio ?? '',
      Array.isArray(m.compensation_types) ? m.compensation_types.join(';') : '',
      m.posture_correction_avg ?? '',
    ]
    rows.push(row.map(v => `"${v}"`).join(','))
  }

  return '\uFEFF' + rows.join('\n')
}


// ============================================================================
// Excel 导出 (使用 Tab-separated values .tsv 兼容格式)
// ============================================================================

/**
 * 匯出為 Excel 相容的 XLSX 格式
 * 由於不引入外部依賴，此處生成符合 Excel 的 XML Spreadsheet 2003 格式
 */
export function exportSessionToExcelXML(
  session: SessionSummary,
  frames: BiomechanicsMetrics[]
): string {
  const m = session.metrics

  // XML Spreadsheet 2003 格式 — Excel 可直接打开
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

<Styles>
  <Style ss:ID="Header">
    <Font ss:Bold="1" ss:Size="11"/>
    <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
    <Font ss:Color="#FFFFFF" ss:Bold="1"/>
  </Style>
  <Style ss:ID="Warn">
    <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Good">
    <Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/>
  </Style>
</Styles>

<!-- 摘要工作表 -->
<Worksheet ss:Name="訓練摘要">
  <Table>
    <Column ss:Width="120"/><Column ss:Width="100"/><Column ss:Width="80"/>
    <Row>
      <Cell ss:StyleID="Header"><Data ss:Type="String">指標</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">數值</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">狀態</Data></Cell>
    </Row>
    <Row><Cell><Data ss:Type="String">長輩 ID</Data></Cell><Cell><Data ss:Type="String">${session.elderId}</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">長輩姓名</Data></Cell><Cell><Data ss:Type="String">${session.elderName}</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">訓練日期</Data></Cell><Cell><Data ss:Type="String">${session.sessionDate}</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">訓練時長（秒）</Data></Cell><Cell><Data ss:Type="Number">${session.durationSeconds}</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">總幀數</Data></Cell><Cell><Data ss:Type="Number">${session.frameCount}</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">━━━ 基礎指標 ━━━</Data></Cell></Row>
    <Row>
      <Cell><Data ss:Type="String">平均 ROM (°)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.avg_rom ?? ''}</Data></Cell>
      <Cell ss:StyleID="${(m.avg_rom || 0) >= 160 ? 'Good' : 'Warn'}"><Data ss:Type="String">${(m.avg_rom || 0) >= 160 ? '✅ 正常' : '⚠️ 受限'}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">平均軀幹傾斜 (°)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.avg_trunk_tilt ?? ''}</Data></Cell>
      <Cell ss:StyleID="${(m.avg_trunk_tilt || 0) <= 15 ? 'Good' : 'Warn'}"><Data ss:Type="String">${(m.avg_trunk_tilt || 0) <= 15 ? '✅ 穩定' : '⚠️ 跌倒風險'}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">平均出手速度</Data></Cell>
      <Cell><Data ss:Type="Number">${m.avg_velocity ?? ''}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">動作穩定率 (%)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.stable_ratio ?? ''}</Data></Cell>
    </Row>
    <Row><Cell><Data ss:Type="String">━━━ 進階指標 (Phase 2) ━━━</Data></Cell></Row>
    <Row>
      <Cell><Data ss:Type="String">中軸穩定度 (°)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.core_stability_angle ?? ''}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">肩角速度 (°/s)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.avg_shoulder_angular_vel ?? ''}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">肘角速度 (°/s)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.avg_elbow_angular_vel ?? ''}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">腕角速度 (°/s)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.avg_wrist_angular_vel ?? ''}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">震顫檢出率 (%)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.tremor_detected_ratio ?? 0}</Data></Cell>
      <Cell ss:StyleID="${(m.tremor_detected_ratio || 0) > 20 ? 'Warn' : 'Good'}"><Data ss:Type="String">${(m.tremor_detected_ratio || 0) > 20 ? '⚠️ 陽性' : '✅ 陰性'}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">代償檢出率 (%)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.compensation_detected_ratio ?? 0}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">代償類型</Data></Cell>
      <Cell><Data ss:Type="String">${Array.isArray(m.compensation_types) ? m.compensation_types.join(', ') : '無'}</Data></Cell>
    </Row>
    <Row>
      <Cell><Data ss:Type="String">坐姿修正角度 (°)</Data></Cell>
      <Cell><Data ss:Type="Number">${m.posture_correction_avg ?? 0}</Data></Cell>
    </Row>
  </Table>
</Worksheet>

<!-- 逐帧数据工作表 -->
<Worksheet ss:Name="逐幀數據">
  <Table>
    <Row>${FRAME_CSV_HEADERS.map(h => `<Cell ss:StyleID="Header"><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>
${frames.map((frame, i) => `    <Row>
      <Cell><Data ss:Type="Number">${i}</Data></Cell>
      <Cell><Data ss:Type="Number">${i * 33}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.elbowROM ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.trunkStability ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.velocity ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.coreStabilityAngle ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.shoulderAngularVel ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.elbowAngularVel ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.wristAngularVel ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.tremorDetected ? 1 : 0}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.tremorFrequency ?? ''}</Data></Cell>
      <Cell><Data ss:Type="String">${frame.tremorSeverity ?? ''}</Data></Cell>
      <Cell><Data ss:Type="String">${frame.compensationType ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.compensationSeverity ?? 0}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.subjectLocked ? 1 : 0}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.subjectConfidence ?? ''}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.postureCorrection ?? 0}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.isHunched ? 1 : 0}</Data></Cell>
      <Cell><Data ss:Type="Number">${frame.isTilted ? 1 : 0}</Data></Cell>
    </Row>`).join('\n')}
  </Table>
</Worksheet>

</Workbook>`

  return xml
}


// ============================================================================
// 浏览器端下载辅助
// ============================================================================

/**
 * 在瀏覽器中觸發檔案下載
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 一鍵匯出訓練數據（逐幀 CSV）
 */
export function downloadFramesCSV(frames: BiomechanicsMetrics[], sessionId: string) {
  const csv = exportFramesToCSV(frames)
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `boccia_frames_${sessionId}_${date}.csv`)
}

/**
 * 一鍵匯出訓練摘要（CSV）
 */
export function downloadSummaryCSV(session: SessionSummary) {
  const csv = exportSessionSummaryToCSV(session)
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `boccia_summary_${session.elderId}_${date}.csv`)
}

/**
 * 一鍵匯出 Excel 格式
 */
export function downloadExcel(session: SessionSummary, frames: BiomechanicsMetrics[]) {
  const xml = exportSessionToExcelXML(session, frames)
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(xml, `boccia_report_${session.elderId}_${date}.xml`, 'application/vnd.ms-excel')
}
