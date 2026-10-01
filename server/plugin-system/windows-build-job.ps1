param([Parameter(Mandatory = $true)][string]$PayloadB64)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Attach this wrapper before starting npm, so its descendants cannot outlive it.
# The unnamed, non-inheritable job handle is held only by this process.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class StzhBuildJob {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    static IntPtr job;
    public static void Attach() {
        job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        var limits = new ExtendedLimits();
        limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        if (!AssignProcessToJobObject(job, Process.GetCurrentProcess().Handle))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        // Do not close the handle while the wrapper is running. Process exit closes it.
    }
}
'@

[StzhBuildJob]::Attach()
$buildPayload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadB64)) | ConvertFrom-Json
$buildNode = [string]$buildPayload.node
$buildArguments = @($buildPayload.args | ForEach-Object { [string]$_ })
& $buildNode @buildArguments
exit $LASTEXITCODE
