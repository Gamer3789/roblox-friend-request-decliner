using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Drawing;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public class Settings { public string cookie; public bool detectOnly; public bool includeExisting; }
public class RequestDecliner : Form {
 static string Root=AppDomain.CurrentDomain.BaseDirectory;
 static string Saved=Path.Combine(Root,"saved-cookie.dat");
 static JavaScriptSerializer Json=new JavaScriptSerializer();
 TextBox cookie=new TextBox(); CheckBox detect=new CheckBox(); CheckBox existing=new CheckBox(); Label status=new Label(); Process listener;
 static byte[] Encrypt(string s) { return ProtectedData.Protect(Encoding.UTF8.GetBytes(s),null,DataProtectionScope.CurrentUser); }
 static string Decrypt(byte[] b) { return Encoding.UTF8.GetString(ProtectedData.Unprotect(b,null,DataProtectionScope.CurrentUser)); }
 public RequestDecliner() {
  Text="Roblox Request Decliner v2"; ClientSize=new Size(560,285); StartPosition=FormStartPosition.CenterScreen; FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false; Font=new Font("Segoe UI",10);
  Label label=new Label(); label.Text="Paste the FULL .ROBLOSECURITY value or Cookie header:"; label.SetBounds(20,20,520,25);
  cookie.SetBounds(20,52,520,30); cookie.UseSystemPasswordChar=true; cookie.MaxLength=65535;
  detect.Text="Detect only (do not decline requests)"; detect.SetBounds(20,95,520,28);
  existing.Text="Also process requests already pending"; existing.SetBounds(20,125,520,28);
  Button save=new Button(); save.Text="Save cookie"; save.SetBounds(20,170,140,35); save.Click+=delegate { SaveSettings(); };
  Button start=new Button(); start.Text="Save and start"; start.SetBounds(175,170,170,35);
  start.Click+=delegate {
   if(listener!=null && !listener.HasExited) { status.Text="Listener already running. Close its console before restarting."; return; }
   if(!SaveSettings()) return;
   try { ProcessStartInfo p=new ProcessStartInfo(); p.FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe"); p.Arguments="/d /c \"\""+Path.Combine(Root,"RunListener.bat")+"\"\""; p.WorkingDirectory=Root; p.UseShellExecute=true; p.WindowStyle=ProcessWindowStyle.Normal; listener=Process.Start(p); status.Text="Listener launched. Its console shows connection status and results."; }
   catch { status.Text="Could not launch listener. Open RunListener.bat in this folder."; }
  };
  Button forget=new Button(); forget.Text="Forget cookie"; forget.SetBounds(360,170,180,35); forget.Click+=delegate { try { if(File.Exists(Saved)) File.Delete(Saved); cookie.Clear(); status.Text="Saved cookie removed. Close any running listener to stop it."; } catch { status.Text="Could not remove saved cookie."; } };
  status.SetBounds(20,220,520,55); status.Text="Cookie is saved encrypted for your Windows account in this folder.";
  Controls.AddRange(new Control[]{label,cookie,detect,existing,save,start,forget,status}); AcceptButton=start;
  if(File.Exists(Saved)) { try { Settings s=Json.Deserialize<Settings>(Decrypt(File.ReadAllBytes(Saved))); cookie.Text=s.cookie; detect.Checked=s.detectOnly; existing.Checked=s.includeExisting; status.Text="Saved cookie loaded. Click Save and start."; } catch { status.Text="Saved cookie could not be decrypted. Paste a new cookie."; } }
 }
 bool SaveSettings() {
  string value=cookie.Text.Trim();
  if(value.Length==0 || value.IndexOfAny(new char[]{'\r','\n'})>=0) { status.Text="Paste a complete value or a single-line Cookie header."; return false; }
  if(value.StartsWith(".RBXID=",StringComparison.OrdinalIgnoreCase) && value.IndexOf(".ROBLOSECURITY=",StringComparison.OrdinalIgnoreCase)<0) { status.Text=".RBXID is a separate cookie. Include .ROBLOSECURITY too."; return false; }

  try { File.WriteAllBytes(Saved,Encrypt(Json.Serialize(new Settings{cookie=value,detectOnly=detect.Checked,includeExisting=existing.Checked}))); status.Text="Saved encrypted for your Windows account."; return true; } catch { status.Text="Could not save. Keep this app in a writable folder."; return false; }
 }
 [STAThread] public static int Main(string[] args) {
  try {
   if(args.Length>0 && args[0]=="--read-config") { Console.Out.Write(Decrypt(File.ReadAllBytes(Saved))); return 0; }
   Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
   if(args.Length>0 && args[0]=="--self-test") { string s=Json.Serialize(new Settings{cookie="dummy",detectOnly=true}); if(Decrypt(Encrypt(s))!=s) return 2; using(RequestDecliner f=new RequestDecliner()) { f.Shown+=delegate { f.Close(); }; Application.Run(f); } return 0; }
   Application.Run(new RequestDecliner()); return 0;
  } catch { if(args.Length==0) MessageBox.Show("Could not open the application. Keep all files together in the original folder.","Roblox Request Decliner"); return 1; }
 }
}
