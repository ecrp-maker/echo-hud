param(
  [Parameter(Mandatory = $true)][string]$Text,
  [int]$Vk = 0,
  [int]$Scan = 41,
  [switch]$Stay,
  [switch]$Back,
  [switch]$Wake,
  [switch]$Tap,
  [switch]$Binds,
  [switch]$Layer
)

$ErrorActionPreference = 'Stop'
$allowed = @(
  'cl_draw_only_deathnotices 1',
  'cl_draw_only_deathnotices 0',
  'engine_no_focus_sleep 0',
  'hideconsole',
  'tap',
  'bind "F8" "exec echo_cam"'
)
$bindLine = '^bind "F(1[3-9]|2[0-4])" "spec_player \\"[^"\\]{1,32}\\""$'
if ($Tap) {
  if ($Vk -ne 119 -or $Scan -ne 66) {
    Write-Output '{"ok":false,"code":"bad"}'
    exit 1
  }
} elseif ($Binds) {
  $bindRows = @($Text -split "`n" | Where-Object { $_.Trim() })
  if ($bindRows.Count -lt 1 -or $bindRows.Count -gt 13) {
    Write-Output '{"ok":false,"code":"bad"}'
    exit 1
  }
  foreach ($row in $bindRows) {
    if ($row -ne 'engine_no_focus_sleep 0' -and $row -notmatch $bindLine) {
      Write-Output '{"ok":false,"code":"bad"}'
      exit 1
    }
  }
} elseif ($allowed -notcontains $Text -and $Text -notmatch '^spec_player "[^"\r\n;]{1,32}"$') {
  Write-Output '{"ok":false,"code":"bad"}'
  exit 1
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
public class EchoInput {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint map);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  public static IntPtr RootFromCursor() {
    POINT p;
    if (!GetCursorPos(out p)) return IntPtr.Zero;
    IntPtr hit = WindowFromPoint(p);
    if (hit == IntPtr.Zero) return IntPtr.Zero;
    IntPtr root = GetAncestor(hit, 2);
    return root == IntPtr.Zero ? hit : root;
  }

  [StructLayout(LayoutKind.Explicit, Size = 40)]
  public struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public ushort wVk;
    [FieldOffset(10)] public ushort wScan;
    [FieldOffset(12)] public uint dwFlags;
    [FieldOffset(16)] public uint time;
    [FieldOffset(24)] public IntPtr dwExtraInfo;
  }

  const uint KEYUP = 0x0002;
  const uint UNICODE = 0x0004;
  const uint SCANCODE = 0x0008;

  public static bool Focus(IntPtr hWnd) {
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
    uint pid;
    uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint target = GetWindowThreadProcessId(hWnd, out pid);
    uint cur = GetCurrentThreadId();
    AttachThreadInput(cur, fgThread, true);
    AttachThreadInput(cur, target, true);
    ShowWindow(hWnd, 5);
    bool ok = SetForegroundWindow(hWnd);
    AttachThreadInput(cur, target, false);
    AttachThreadInput(cur, fgThread, false);
    return ok;
  }

  static void Send(INPUT input) {
    INPUT[] list = new INPUT[] { input };
    SendInput(1, list, 40);
  }

  public static void TapScan(ushort scan) {
    INPUT down = new INPUT();
    down.type = 1;
    down.wScan = scan;
    down.dwFlags = SCANCODE;
    INPUT up = new INPUT();
    up.type = 1;
    up.wScan = scan;
    up.dwFlags = SCANCODE | KEYUP;
    Send(down);
    Thread.Sleep(30);
    Send(up);
  }

  public static void TapVk(ushort vk) {
    INPUT down = new INPUT();
    down.type = 1;
    down.wVk = vk;
    INPUT up = new INPUT();
    up.type = 1;
    up.wVk = vk;
    up.dwFlags = KEYUP;
    Send(down);
    Thread.Sleep(30);
    Send(up);
  }

  public static void Backspaces(int count) {
    INPUT[] list = new INPUT[count * 2];
    for (int i = 0; i < count; i++) {
      INPUT down = new INPUT();
      down.type = 1;
      down.wVk = 0x08;
      INPUT up = new INPUT();
      up.type = 1;
      up.wVk = 0x08;
      up.dwFlags = KEYUP;
      list[i * 2] = down;
      list[i * 2 + 1] = up;
    }
    SendInput((uint)list.Length, list, 40);
  }

  public static void TypeLine(string text) {
    INPUT[] list = new INPUT[text.Length * 2 + 2];
    int i = 0;
    foreach (char c in text) {
      INPUT down = new INPUT();
      down.type = 1;
      down.wScan = c;
      down.dwFlags = UNICODE;
      INPUT up = new INPUT();
      up.type = 1;
      up.wScan = c;
      up.dwFlags = UNICODE | KEYUP;
      list[i++] = down;
      list[i++] = up;
    }
    INPUT enter = new INPUT();
    enter.type = 1;
    enter.wVk = 0x0D;
    INPUT enterUp = new INPUT();
    enterUp.type = 1;
    enterUp.wVk = 0x0D;
    enterUp.dwFlags = KEYUP;
    list[i++] = enter;
    list[i++] = enterUp;
    SendInput((uint)list.Length, list, 40);
  }

  const uint WM_KEYDOWN = 0x0100;
  const uint WM_KEYUP = 0x0101;
  const uint WM_CHAR = 0x0102;

  static IntPtr KeyL(ushort vk, bool up) {
    uint scan = MapVirtualKey(vk, 0);
    long value = 1L | ((long)scan << 16);
    if (up) value |= 0xC0000000L;
    return new IntPtr(value);
  }

  public static void PostTap(IntPtr hwnd, ushort vk) {
    PostMessage(hwnd, WM_KEYDOWN, (IntPtr)vk, KeyL(vk, false));
    PostMessage(hwnd, WM_KEYUP, (IntPtr)vk, KeyL(vk, true));
  }

  public static void PostLine(IntPtr hwnd, string text) {
    foreach (char c in text) PostMessage(hwnd, WM_CHAR, (IntPtr)c, IntPtr.Zero);
    PostTap(hwnd, 0x0D);
  }

  public static void PostBackspaces(IntPtr hwnd, int count) {
    for (int i = 0; i < count; i++) PostTap(hwnd, 0x08);
  }

  public static void ShiftF2() {
    INPUT shift = new INPUT();
    shift.type = 1;
    shift.wScan = 0x2A;
    shift.dwFlags = SCANCODE;
    INPUT f2 = new INPUT();
    f2.type = 1;
    f2.wScan = 0x3C;
    f2.dwFlags = SCANCODE;
    INPUT f2Up = new INPUT();
    f2Up.type = 1;
    f2Up.wScan = 0x3C;
    f2Up.dwFlags = SCANCODE | KEYUP;
    INPUT shiftUp = new INPUT();
    shiftUp.type = 1;
    shiftUp.wScan = 0x2A;
    shiftUp.dwFlags = SCANCODE | KEYUP;
    SendInput(4, new INPUT[] { shift, f2, f2Up, shiftUp }, 40);
  }
}
"@

$proc = Get-Process -Name cs2 -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $proc) {
  Write-Output '{"ok":false,"code":"nocs2"}'
  exit 2
}

$hwnd = $proc.MainWindowHandle
function Open-Console {
  if ($Scan -gt 0) { [EchoInput]::TapScan([uint16]$Scan) } else { [EchoInput]::TapVk([uint16]$Vk) }
}
function Test-OnGame {
  $fg = [EchoInput]::GetForegroundWindow()
  $hit = [EchoInput]::RootFromCursor()
  $onGame = $fg.ToInt64() -eq $hwnd.ToInt64() -or $hit.ToInt64() -eq $hwnd.ToInt64()
  if (-not $onGame -and $hit -ne [IntPtr]::Zero) {
    $hitPid = [uint32]0
    [void][EchoInput]::GetWindowThreadProcessId($hit, [ref]$hitPid)
    $hitProc = Get-Process -Id $hitPid -ErrorAction SilentlyContinue
    if ($hitProc -and $hitProc.ProcessName -eq 'Overlay') { $onGame = $true }
  }
  if (-not $onGame) { return $false }
  if ($fg.ToInt64() -ne $hwnd.ToInt64()) {
    [void][EchoInput]::Focus($hwnd)
    Start-Sleep -Milliseconds 120
    if ([EchoInput]::GetForegroundWindow().ToInt64() -ne $hwnd.ToInt64()) { return $false }
  }
  return $true
}
if ($Tap) {
  if (-not (Test-OnGame)) {
    Write-Output '{"ok":false,"code":"away"}'
    exit 4
  }
  if ($Scan -gt 0) { [EchoInput]::TapScan([uint16]$Scan) } else { [EchoInput]::TapVk([uint16]$Vk) }
  Write-Output '{"ok":true}'
  exit 0
}
if ($Layer) {
  $fg = [EchoInput]::GetForegroundWindow()
  $hit = [EchoInput]::RootFromCursor()
  $onGame = $fg.ToInt64() -eq $hwnd.ToInt64() -or $hit.ToInt64() -eq $hwnd.ToInt64()
  if (-not $onGame -and $hit -ne [IntPtr]::Zero) {
    $hitPid = [uint32]0
    [void][EchoInput]::GetWindowThreadProcessId($hit, [ref]$hitPid)
    $hitProc = Get-Process -Id $hitPid -ErrorAction SilentlyContinue
    if ($hitProc -and $hitProc.ProcessName -eq 'Overlay') { $onGame = $true }
  }
  if (-not $onGame) {
    Write-Output '{"ok":false,"code":"away"}'
    exit 4
  }
  if ($fg.ToInt64() -ne $hwnd.ToInt64()) {
    [void][EchoInput]::Focus($hwnd)
    Start-Sleep -Milliseconds 160
    if ([EchoInput]::GetForegroundWindow().ToInt64() -ne $hwnd.ToInt64()) {
      Write-Output '{"ok":false,"code":"nofocus"}'
      exit 3
    }
  }
} elseif ($Back) {
  $consoleVk = $Vk
  if ($consoleVk -eq 0) { $consoleVk = 0xC0 }
  [EchoInput]::PostTap($hwnd, [uint16]$consoleVk)
  Start-Sleep -Milliseconds 180
  [EchoInput]::PostBackspaces($hwnd, 40)
  if ($Binds) {
    [EchoInput]::PostLine($hwnd, 'hideconsole')
    Start-Sleep -Milliseconds 120
    [EchoInput]::PostTap($hwnd, [uint16]$consoleVk)
    Start-Sleep -Milliseconds 180
    foreach ($row in $bindRows) {
      [EchoInput]::PostLine($hwnd, $row)
      Start-Sleep -Milliseconds 50
    }
  } else {
    if ($Wake) {
      [EchoInput]::PostLine($hwnd, 'engine_no_focus_sleep 0')
      Start-Sleep -Milliseconds 90
    }
    [EchoInput]::PostLine($hwnd, $Text)
    Start-Sleep -Milliseconds 90
  }
  [EchoInput]::PostLine($hwnd, 'hideconsole')
  Write-Output '{"ok":true,"code":"back"}'
  exit 0
}
if ($Stay) {
  if ([EchoInput]::GetForegroundWindow().ToInt64() -ne $hwnd.ToInt64()) {
    Write-Output '{"ok":false,"code":"away"}'
    exit 4
  }
} else {
  [void][EchoInput]::Focus($hwnd)
  Start-Sleep -Milliseconds 220
  if ([EchoInput]::GetForegroundWindow().ToInt64() -ne $hwnd.ToInt64()) {
    Write-Output '{"ok":false,"code":"nofocus"}'
    exit 3
  }
}

if ($Binds) {
  Open-Console
  Start-Sleep -Milliseconds 260
  [EchoInput]::TypeLine('hideconsole')
  Start-Sleep -Milliseconds 220
  Open-Console
  Start-Sleep -Milliseconds 260
  [EchoInput]::Backspaces(40)
  foreach ($row in $bindRows) {
    Start-Sleep -Milliseconds 40
    [EchoInput]::TypeLine($row)
    Start-Sleep -Milliseconds 70
  }
  Start-Sleep -Milliseconds 120
  [EchoInput]::TypeLine('hideconsole')
  Write-Output '{"ok":true}'
  exit 0
}

if ($Text -eq 'bind "F8" "exec echo_cam"') {
  Open-Console
  Start-Sleep -Milliseconds 200
  [EchoInput]::TypeLine('hideconsole')
  Start-Sleep -Milliseconds 180
  Open-Console
  Start-Sleep -Milliseconds 220
  [EchoInput]::Backspaces(40)
  [EchoInput]::TypeLine($Text)
  Start-Sleep -Milliseconds 80
  [EchoInput]::TypeLine('hideconsole')
  Write-Output '{"ok":true}'
  exit 0
}

Open-Console
Start-Sleep -Milliseconds 200
[EchoInput]::Backspaces(40)
Start-Sleep -Milliseconds 40
if ($Text -eq 'cl_draw_only_deathnotices 1') {
  [EchoInput]::TypeLine('cl_draw_only_deathnotices 1')
  Start-Sleep -Milliseconds 160
  [EchoInput]::TypeLine('echo hud on')
  Start-Sleep -Milliseconds 160
  [EchoInput]::TypeLine('engine_no_focus_sleep 0')
  Start-Sleep -Milliseconds 160
  [EchoInput]::TypeLine('hideconsole')
  Start-Sleep -Milliseconds 220
  [EchoInput]::ShiftF2()
} else {
  [EchoInput]::TypeLine($Text)
  Start-Sleep -Milliseconds 160
  [EchoInput]::TypeLine('hideconsole')
}
Write-Output '{"ok":true}'
