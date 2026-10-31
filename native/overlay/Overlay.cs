using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class EchoOverlay : Form {
  const int GWL_EXSTYLE = -20;
  const int WS_EX_TRANSPARENT = 0x20;
  const int WS_EX_NOACTIVATE = 0x08000000;
  const uint SWP_NOACTIVATE = 0x0010;
  const uint SWP_SHOWWINDOW = 0x0040;
  const uint SWP_NOMOVE = 0x0002;
  const uint SWP_NOSIZE = 0x0001;

  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int n);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int n, int v);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr h, ref MARGINS m);

  delegate bool EnumProc(IntPtr h, IntPtr l);
  struct RECT { public int Left, Top, Right, Bottom; }
  struct MARGINS { public int Left, Top, Right, Bottom; }

  static readonly IntPtr NotTop = new IntPtr(-2);
  readonly string url;
  readonly Timer timer = new Timer();
  WebView2 view;
  IntPtr previous;
  int missing;
  int punchTick;
  bool restored;
  int lastLeft = int.MinValue;
  int lastTop;
  int lastW;
  int lastH;
  IntPtr lastMarker = new IntPtr(-1);

  protected override CreateParams CreateParams {
    get {
      CreateParams cp = base.CreateParams;
      cp.ExStyle |= 0x80000 | 0x08000000 | 0x80 | 0x00200000;
      return cp;
    }
  }

  EchoOverlay(string target) {
    url = target;
    FormBorderStyle = FormBorderStyle.None;
    ShowInTaskbar = false;
    StartPosition = FormStartPosition.Manual;
    Bounds = new Rectangle(0, 0, 640, 360);
    view = new WebView2 { Dock = DockStyle.Fill };
    Controls.Add(view);
    Load += OnLoad;
    timer.Interval = 150;
    timer.Tick += (s, e) => Follow();
  }

  static void Log(string line) {
    try {
      System.IO.File.AppendAllText(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "echo-overlay-log.txt"), line + "\r\n");
    } catch { /* kayıt şart değil */ }
  }

  async void OnLoad(object sender, EventArgs e) {
    Log("load");
    var margins = new MARGINS { Left = -1, Top = -1, Right = -1, Bottom = -1 };
    DwmExtendFrameIntoClientArea(Handle, ref margins);
    previous = GetForegroundWindow();
    try {
      string data = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "echo-hud-overlay");
      var env = await CoreWebView2Environment.CreateAsync(null, data);
      await view.EnsureCoreWebView2Async(env);
      view.DefaultBackgroundColor = Color.FromArgb(0, 0, 0, 0);
      view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
      view.CoreWebView2.Settings.AreDevToolsEnabled = false;
      view.CoreWebView2.Settings.IsStatusBarEnabled = false;
      view.CoreWebView2.Navigate(url);
      Log("nav");
    } catch (Exception ex) {
      Log("err " + ex.GetType().Name + " " + ex.Message);
      Close();
      return;
    }
    timer.Start();
  }

  static IntPtr Game() {
    foreach (Process proc in Process.GetProcessesByName("cs2")) {
      try {
        if (proc.MainWindowHandle != IntPtr.Zero) return proc.MainWindowHandle;
      } catch { /* süreç kapandı */ }
    }
    return IntPtr.Zero;
  }

  void Punch(IntPtr hwnd) {
    int style = GetWindowLong(hwnd, GWL_EXSTYLE);
    SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE);
    EnumChildWindows(hwnd, (child, l) => { Punch(child); return true; }, IntPtr.Zero);
  }

  void RestoreFocus() {
    if (restored) return;
    restored = true;
    IntPtr now = GetForegroundWindow();
    if (now == Handle && previous != IntPtr.Zero && previous != Handle) SetForegroundWindow(previous);
  }

  void Follow() {
    IntPtr game = Game();
    if (game == IntPtr.Zero) {
      missing += 1;
      if (missing == 1 || missing == 20) Log("no-game " + missing);
      if (missing > 400) Close();
      return;
    }
    missing = 0;
    if (IsIconic(game)) {
      if (Visible) Hide();
      return;
    }
    RECT rect;
    if (!GetWindowRect(game, out rect)) return;
    int w = rect.Right - rect.Left;
    int h = rect.Bottom - rect.Top;
    if (w < 80 || h < 80) return;
    if (!Visible) Show();
    punchTick += 1;
    if (punchTick == 1 || punchTick % 20 == 0) Punch(Handle);
    IntPtr marker = GetWindow(game, 3);
    if (marker == IntPtr.Zero || marker == Handle) marker = IntPtr.Zero;
    bool samePlace = rect.Left == lastLeft && rect.Top == lastTop && w == lastW && h == lastH;
    if (samePlace && marker == lastMarker) return;
    if (!samePlace) {
      SetWindowPos(Handle, NotTop, rect.Left, rect.Top, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
      lastLeft = rect.Left;
      lastTop = rect.Top;
      lastW = w;
      lastH = h;
    }
    SetWindowPos(Handle, marker, 0, 0, 0, 0, SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    lastMarker = marker;
    if (!restored) Log("placed " + rect.Left + "," + rect.Top + " " + w + "x" + h);
    RestoreFocus();
  }

  [STAThread]
  static void Main(string[] args) {
    Log("main");
    if (args.Length < 1 || args[0].Length < 8) return;
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { /* eski Windows */ }
    Application.EnableVisualStyles();
    Application.Run(new EchoOverlay(args[0]));
  }
}
