using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

class EchoSetup {
  [STAThread]
  static int Main(string[] args) {
    bool silent = Has(args, "/silent");
    bool installNow = Has(args, "/install");
    string dirArg = Value(args, "/dir=");
    try {
      if (Has(args, "/update")) {
        string dir = Value(args, "/dir=").Trim().Trim('"');
        bool open = Has(args, "/open");
        if (dir.Length == 0) dir = InstalledDir();
        if (dir.Length == 0) throw new Exception("Kurulu program bulunamadı.");
        if (!IsAdmin() && !CanWrite(dir)) {
          if (!RelaunchUpdate(dir, open)) MessageBox.Show("Güncelleme onaylanmadı.", "ECHO HUD");
          return 0;
        }
        Release(dir);
        Install(dir, open);
        return 0;
      }
      if (silent) {
        Install(dirArg, false);
        return 0;
      }
      if (installNow) {
        if (!IsAdmin()) return 1;
        Install(dirArg, Has(args, "/open"));
        return 0;
      }
      Application.EnableVisualStyles();
      Application.Run(new SetupForm());
      return 0;
    } catch (Exception ex) {
      if (!silent) MessageBox.Show(ex.Message, "ECHO HUD", MessageBoxButtons.OK, MessageBoxIcon.Error);
      Console.Error.WriteLine(ex.Message);
      return 1;
    }
  }

  static bool Has(string[] args, string flag) {
    foreach (string arg in args) {
      if (string.Equals(arg, flag, StringComparison.OrdinalIgnoreCase)) return true;
    }
    return false;
  }

  static string Value(string[] args, string prefix) {
    foreach (string arg in args) {
      if (arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return arg.Substring(prefix.Length);
    }
    return "";
  }

  internal static bool IsAdmin() {
    WindowsIdentity id = WindowsIdentity.GetCurrent();
    WindowsPrincipal principal = new WindowsPrincipal(id);
    return principal.IsInRole(WindowsBuiltInRole.Administrator);
  }

  internal static string Install(string dirArg, bool launch) {
    string payload = ExtractPayload();
    bool custom = dirArg.Length > 0;
    bool admin = IsAdmin();
    string dir = custom
      ? dirArg
      : Path.Combine(admin ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"), "ECHO HUD");
    dir = PrepareDir(dir);
    CopyTree(payload, dir);
    GrantWrite(dir);
    string bat = Path.Combine(dir, "ECHO HUD.bat");
    if (File.Exists(bat)) File.Delete(bat);
    WriteResource("ECHO.Uninstall.exe", Path.Combine(dir, "Uninstall.exe"));
    string version = ReadVersion(Path.Combine(dir, "package.json"));
    bool inPrograms = IsUnderPrograms(dir);
    string hive = (admin && (inPrograms || !custom)) ? "HKLM" : "HKCU";
    string desktop = Environment.GetFolderPath(admin && !custom ? Environment.SpecialFolder.CommonDesktopDirectory : Environment.SpecialFolder.DesktopDirectory);
    string programs = Environment.GetFolderPath(admin && !custom ? Environment.SpecialFolder.CommonPrograms : Environment.SpecialFolder.Programs);
    string exe = Path.Combine(dir, "ECHO HUD.exe");
    string desktopLink = Path.Combine(desktop, "ECHO HUD.lnk");
    string menuLink = Path.Combine(programs, "ECHO HUD.lnk");
    Shortcut(desktopLink, exe, dir);
    Shortcut(menuLink, exe, dir);
    WriteUninstallKey(hive, dir, exe, version);
    File.WriteAllText(Path.Combine(dir, "install.json"),
      "{\r\n  \"name\": \"ECHO HUD\",\r\n  \"hive\": \"" + hive + "\",\r\n  \"shortcuts\": [\r\n    \"" + Escape(desktopLink) + "\",\r\n    \"" + Escape(menuLink) + "\"\r\n  ]\r\n}\r\n");
    try { Directory.Delete(Path.GetDirectoryName(Path.GetDirectoryName(payload)), true); } catch { }
    if (launch) {
      Process.Start(new ProcessStartInfo { FileName = exe, WorkingDirectory = dir, UseShellExecute = true });
    }
    return dir;
  }

  static bool IsUnderPrograms(string dir) {
    try {
      string full = Path.GetFullPath(dir).TrimEnd('\\');
      string programs = Path.GetFullPath(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)).TrimEnd('\\');
      string programs86 = Path.GetFullPath(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)).TrimEnd('\\');
      if (full.Equals(programs, StringComparison.OrdinalIgnoreCase) || full.StartsWith(programs + "\\", StringComparison.OrdinalIgnoreCase)) return true;
      if (programs86.Length > 0 && (full.Equals(programs86, StringComparison.OrdinalIgnoreCase) || full.StartsWith(programs86 + "\\", StringComparison.OrdinalIgnoreCase))) return true;
    } catch { }
    return false;
  }

  static string InstalledDir() {
    RegistryKey[] roots = new RegistryKey[] { Registry.LocalMachine, Registry.CurrentUser };
    foreach (RegistryKey root in roots) {
      using (RegistryKey key = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ECHO HUD")) {
        if (key == null) continue;
        string dir = key.GetValue("InstallLocation") as string;
        if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) return dir;
      }
    }
    return "";
  }

  static bool CanWrite(string dir) {
    try {
      Directory.CreateDirectory(dir);
      string probe = Path.Combine(dir, ".echo-write-probe");
      File.WriteAllText(probe, "1");
      File.Delete(probe);
      return true;
    } catch {
      return false;
    }
  }

  static bool RelaunchUpdate(string dir, bool open) {
    try {
      ProcessStartInfo info = new ProcessStartInfo();
      info.FileName = Application.ExecutablePath;
      info.UseShellExecute = true;
      info.Verb = "runas";
      info.WindowStyle = ProcessWindowStyle.Normal;
      info.Arguments = "/update /dir=\"" + dir + "\"" + (open ? " /open" : "");
      Process.Start(info);
      return true;
    } catch {
      return false;
    }
  }

  static void Release(string dir) {
    string full = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
    string[] names = new string[] { "ECHO HUD", "Overlay" };
    foreach (string name in names) {
      foreach (Process proc in Process.GetProcessesByName(name)) {
        try {
          string path = proc.MainModule.FileName;
          if (path.StartsWith(full, StringComparison.OrdinalIgnoreCase)) proc.Kill();
        } catch { }
      }
    }
    string exe = Path.Combine(dir, "ECHO HUD.exe");
    for (int i = 0; i < 40; i++) {
      if (!File.Exists(exe)) return;
      try {
        using (FileStream stream = File.Open(exe, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
        return;
      } catch {
        System.Threading.Thread.Sleep(250);
      }
    }
  }

  static void GrantWrite(string dir) {
    try {
      DirectoryInfo info = new DirectoryInfo(dir);
      DirectorySecurity security = info.GetAccessControl();
      SecurityIdentifier users = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
      security.AddAccessRule(new FileSystemAccessRule(
        users,
        FileSystemRights.Modify,
        InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
        PropagationFlags.None,
        AccessControlType.Allow));
      info.SetAccessControl(security);
    } catch { }
  }

  static string Escape(string value) {
    return value.Replace("\\", "\\\\");
  }

  static void WriteUninstallKey(string hive, string dir, string exe, string version) {
    RegistryKey root = hive == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser;
    using (RegistryKey key = root.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ECHO HUD")) {
      key.SetValue("DisplayName", "ECHO HUD");
      key.SetValue("DisplayVersion", version);
      key.SetValue("Publisher", "ECRP");
      key.SetValue("InstallLocation", dir);
      key.SetValue("UninstallString", "\"" + Path.Combine(dir, "Uninstall.exe") + "\"");
      key.SetValue("DisplayIcon", exe + ",0");
      key.SetValue("NoModify", 1, RegistryValueKind.DWord);
      key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
      key.SetValue("EstimatedSize", SizeKb(dir), RegistryValueKind.DWord);
      key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
    }
  }

  static int SizeKb(string dir) {
    long bytes = 0;
    foreach (string file in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) {
      try { bytes += new FileInfo(file).Length; } catch { }
    }
    return (int)(bytes / 1024L);
  }

  static string ReadVersion(string packagePath) {
    string json = File.ReadAllText(packagePath);
    Match match = Regex.Match(json, "\"version\"\\s*:\\s*\"([^\"]+)\"");
    return match.Success ? match.Groups[1].Value : "1.0.0";
  }

  static void Shortcut(string lnk, string target, string work) {
    Type type = Type.GetTypeFromProgID("WScript.Shell");
    object shell = Activator.CreateInstance(type);
    object link = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
    Type linkType = link.GetType();
    linkType.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, link, new object[] { target });
    linkType.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, link, new object[] { work });
    linkType.InvokeMember("Description", System.Reflection.BindingFlags.SetProperty, null, link, new object[] { "ECHO HUD" });
    linkType.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, link, null);
  }

  static string ExtractPayload() {
    string temp = Path.Combine(Path.GetTempPath(), "echo-hud-setup-" + Guid.NewGuid().ToString("N"));
    string zip = Path.Combine(temp, "payload.zip");
    string output = Path.Combine(temp, "out");
    Directory.CreateDirectory(temp);
    Directory.CreateDirectory(output);
    WriteResource("ECHO.payload.zip", zip);
    ZipFile.ExtractToDirectory(zip, output);
    if (File.Exists(Path.Combine(output, "ECHO HUD.exe"))) return output;
    foreach (string child in Directory.GetDirectories(output)) {
      if (File.Exists(Path.Combine(child, "ECHO HUD.exe"))) return child;
    }
    throw new Exception("Kurulum paketi bozuk.");
  }

  static void WriteResource(string name, string dest) {
    using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) {
      if (stream == null) throw new Exception("Kurulum dosyası eksik.");
      Directory.CreateDirectory(Path.GetDirectoryName(dest));
      using (FileStream file = File.Create(dest)) stream.CopyTo(file);
    }
  }

  // Hedef klasörü yalnızca boşsa ya da önceki bir ECHO HUD kurulumuysa (install.json varsa) kullanır.
  // Başka dosyalar içeren bir klasör asla silinmez.
  static string PrepareDir(string dir) {
    string full = Path.GetFullPath(dir.Trim().Trim('"')).TrimEnd('\\');
    string root = (Path.GetPathRoot(full) ?? "").TrimEnd('\\');
    if (full.Length == 0 || full.Equals(root, StringComparison.OrdinalIgnoreCase))
      throw new Exception("Sürücü köküne kurulamaz. Bir klasör seçin.");
    if (!Directory.Exists(full)) return full;
    bool ours = File.Exists(Path.Combine(full, "install.json"));
    if (ours) {
      ClearDir(full);
      return full;
    }
    if (Directory.GetFileSystemEntries(full).Length > 0)
      throw new Exception("Seçilen klasör boş değil ve bir ECHO HUD kurulumu değil:\n" + full + "\n\nİçindeki dosyalar silinmesin diye kurulum durduruldu. Boş bir klasör seçin.");
    return full;
  }

  static void ClearDir(string dir) {
    if (!Directory.Exists(dir)) return;
    foreach (string file in Directory.GetFiles(dir)) {
      try { File.Delete(file); } catch { }
    }
    foreach (string child in Directory.GetDirectories(dir)) {
      try { Directory.Delete(child, true); } catch { }
    }
  }

  static void CopyTree(string from, string to) {
    Directory.CreateDirectory(to);
    foreach (string file in Directory.GetFiles(from)) {
      File.Copy(file, Path.Combine(to, Path.GetFileName(file)), true);
    }
    foreach (string child in Directory.GetDirectories(from)) {
      CopyTree(child, Path.Combine(to, Path.GetFileName(child)));
    }
  }
}

class SetupForm : Form {
  readonly CheckBox openAfter = new CheckBox();
  readonly Button install = new Button();
  readonly Label status = new Label();

  public SetupForm() {
    Text = "ECHO HUD Kurulum";
    FormBorderStyle = FormBorderStyle.FixedDialog;
    MaximizeBox = false;
    MinimizeBox = false;
    StartPosition = FormStartPosition.CenterScreen;
    ClientSize = new Size(480, 250);
    BackColor = Color.FromArgb(16, 20, 15);
    ForeColor = Color.FromArgb(244, 247, 242);
    Font = new Font("Segoe UI", 10);
    Label title = new Label {
      Text = "ECHO HUD",
      Font = new Font("Segoe UI", 22, FontStyle.Bold),
      ForeColor = Color.FromArgb(214, 255, 74),
      AutoSize = true,
      Location = new Point(28, 22),
    };
    Label body = new Label {
      Text = "Program bu bilgisayara kurulur.\nMasaüstü, Başlat menüsü ve uygulama listesine eklenir.",
      AutoSize = true,
      Location = new Point(28, 78),
    };
    status.AutoSize = true;
    status.Location = new Point(28, 132);
    status.ForeColor = Color.FromArgb(214, 255, 74);
    openAfter.Text = "Kurulunca aç";
    openAfter.Checked = true;
    openAfter.AutoSize = true;
    openAfter.Location = new Point(28, 164);
    openAfter.ForeColor = Color.FromArgb(244, 247, 242);
    install.Text = "Kur";
    install.Location = new Point(268, 198);
    install.Size = new Size(90, 34);
    install.FlatStyle = FlatStyle.Flat;
    install.BackColor = Color.FromArgb(214, 255, 74);
    install.ForeColor = Color.FromArgb(18, 22, 15);
    Button cancel = new Button {
      Text = "İptal",
      Location = new Point(366, 198),
      Size = new Size(86, 34),
      FlatStyle = FlatStyle.Flat,
      BackColor = Color.FromArgb(32, 38, 30),
      ForeColor = Color.FromArgb(244, 247, 242),
    };
    install.Click += InstallClick;
    cancel.Click += delegate { Close(); };
    Controls.Add(title);
    Controls.Add(body);
    Controls.Add(status);
    Controls.Add(openAfter);
    Controls.Add(install);
    Controls.Add(cancel);
  }

  void InstallClick(object sender, EventArgs e) {
    if (install.Text == "Bitir") {
      Close();
      return;
    }
    install.Enabled = false;
    status.Text = "Kuruluyor...";
    status.Refresh();
    try {
      if (!EchoSetup.IsAdmin()) {
        status.Text = "İzin penceresine Evet deyin.";
        status.Refresh();
        Activate();
        TopMost = true;
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = Application.ExecutablePath;
        info.UseShellExecute = true;
        info.Verb = "runas";
        info.WindowStyle = ProcessWindowStyle.Normal;
        info.ErrorDialog = true;
        info.ErrorDialogParentHandle = Handle;
        info.Arguments = "/install" + (openAfter.Checked ? " /open" : "");
        Process proc = Process.Start(info);
        if (proc == null) throw new Exception("Windows izin penceresi açılmadı. Güvenlik duvarı bu pencereyi engellemez.");
        proc.WaitForExit();
        TopMost = false;
        if (proc.ExitCode != 0) throw new Exception("Kurulum tamamlanmadı.");
      } else {
        EchoSetup.Install("", openAfter.Checked);
      }
      status.Text = "Kuruldu.";
      install.Text = "Bitir";
      install.Enabled = true;
      openAfter.Enabled = false;
    } catch (Exception ex) {
      status.Text = "";
      install.Enabled = true;
      MessageBox.Show(ex.Message, "ECHO HUD", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
  }
}
