using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

class EchoUninstall {
  [STAThread]
  static int Main(string[] args) {
    bool silent = false;
    foreach (string arg in args) {
      if (string.Equals(arg, "/silent", StringComparison.OrdinalIgnoreCase)) silent = true;
    }
    string dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
    if (!silent) {
      DialogResult answer = MessageBox.Show(
        "ECHO HUD bu bilgisayardan kaldırılsın mı?",
        "ECHO HUD",
        MessageBoxButtons.YesNo,
        MessageBoxIcon.Question);
      if (answer != DialogResult.Yes) return 0;
    }
    try {
      Remove(dir);
    } catch (Exception ex) {
      if (!silent) MessageBox.Show(ex.Message, "ECHO HUD", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return 1;
    }
    return 0;
  }

  static void Remove(string dir) {
    string metaPath = Path.Combine(dir, "install.json");
    string hive = "HKCU";
    string name = "ECHO HUD";
    string[] shortcuts = new string[0];
    string drive = (Path.GetPathRoot(dir) ?? "").TrimEnd('\\');
    if (!File.Exists(metaPath) || dir.Length == 0 || dir.Equals(drive, StringComparison.OrdinalIgnoreCase))
      throw new Exception("Bu klasör bir ECHO HUD kurulumu olarak tanınmadı (install.json yok). Hiçbir dosya silinmedi:\n" + dir);
    if (File.Exists(metaPath)) {
      string json = File.ReadAllText(metaPath);
      hive = Read(json, "hive", hive);
      name = Read(json, "name", name);
      shortcuts = ReadList(json);
    }
    foreach (Process proc in Process.GetProcessesByName("ECHO HUD")) {
      try {
        string path = proc.MainModule.FileName;
        if (path.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) proc.Kill();
      } catch { }
    }
    foreach (string link in shortcuts) {
      try { if (File.Exists(link)) File.Delete(link); } catch { }
    }
    RegistryKey root = hive == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser;
    try { root.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + name, false); } catch { }
    string bat = Path.Combine(Path.GetTempPath(), "echo-hud-uninstall.bat");
    File.WriteAllText(bat, "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nrd /s /q \"" + dir + "\"\r\ndel \"%~f0\"\r\n");
    Process.Start(new ProcessStartInfo {
      FileName = bat,
      CreateNoWindow = true,
      UseShellExecute = false,
      WindowStyle = ProcessWindowStyle.Hidden,
    });
  }

  static string Read(string json, string key, string fallback) {
    string token = "\"" + key + "\"";
    int at = json.IndexOf(token, StringComparison.Ordinal);
    if (at < 0) return fallback;
    int colon = json.IndexOf(':', at + token.Length);
    int quote = json.IndexOf('"', colon + 1);
    int end = json.IndexOf('"', quote + 1);
    if (quote < 0 || end < 0) return fallback;
    return json.Substring(quote + 1, end - quote - 1).Replace("\\\\", "\\");
  }

  static string[] ReadList(string json) {
    int at = json.IndexOf("\"shortcuts\"", StringComparison.Ordinal);
    if (at < 0) return new string[0];
    int open = json.IndexOf('[', at);
    int close = json.IndexOf(']', open + 1);
    if (open < 0 || close < 0) return new string[0];
    string body = json.Substring(open + 1, close - open - 1);
    string[] parts = body.Split(',');
    int count = 0;
    for (int i = 0; i < parts.Length; i++) if (parts[i].IndexOf('"') >= 0) count++;
    string[] list = new string[count];
    int n = 0;
    for (int i = 0; i < parts.Length; i++) {
      int quote = parts[i].IndexOf('"');
      int end = parts[i].LastIndexOf('"');
      if (quote < 0 || end <= quote) continue;
      list[n++] = parts[i].Substring(quote + 1, end - quote - 1).Replace("\\\\", "\\");
    }
    return list;
  }
}
