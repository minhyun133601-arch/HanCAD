param(
    [ValidateRange(1, 30)]
    [int] $Seconds = 15
)

# Hold the clipboard for a bounded native failure test without replacing data.
$ErrorActionPreference = 'Stop'
if (-not ('HanCadClipboardContention' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;

public static class HanCadClipboardContention
{
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenClipboard(IntPtr owner);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseClipboard();

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowExW(uint extendedStyle, string className,
        string title, uint style, int x, int y, int width, int height,
        IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyWindow(IntPtr window);

    public static void Hold(int seconds)
    {
        // Keep a unique message-only HWND and every Clipboard call on one thread.
        IntPtr owner = CreateWindowExW(0, "STATIC", "HanCAD Clipboard QA", 0,
            0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (owner == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "검증용 창을 만들 수 없습니다.");
        bool opened = false;
        try
        {
            if (!OpenClipboard(owner))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "클립보드를 열 수 없습니다.");
            opened = true;
            Console.WriteLine("클립보드를 {0}초 동안 잠급니다. 다른 HanCAD 창에서 CUTCLIP 실패와 원본 보존을 확인하십시오.", seconds);
            Console.Out.Flush();
            Thread.Sleep(TimeSpan.FromSeconds(seconds));
        }
        finally
        {
            if (opened) CloseClipboard();
            DestroyWindow(owner);
            if (opened) Console.WriteLine("클립보드 잠금을 해제했습니다.");
        }
    }
}
'@
}

[HanCadClipboardContention]::Hold($Seconds)
