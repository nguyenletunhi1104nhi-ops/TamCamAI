# Firebase Rules cho TamCam AI

File rules chinh: `firestore.rules`

Muc tieu:

- User da dang nhap chi duoc doc/ghi du lieu cua chinh ho.
- Chan loi `Missing or insufficient permissions` cho cac collection app dang dung.
- Khong mo quyen public cho du lieu task, tai lieu, lich su chat.

## Collection dang duoc bao ve

- `users/{uid}`: profile va settings cua user.
- `tasks/{taskId}`: task, lich, checklist, trang thai.
- `documents/{documentId}`: file da upload va ket qua phan tich.
- `chatConversations/{conversationId}`: lich su chat.

Cac collection khac mac dinh bi chan.

## Cach deploy rules

1. Cai Firebase CLI neu may chua co:

```powershell
npm install -g firebase-tools
```

2. Dang nhap Firebase:

```powershell
firebase login
```

3. Chon dung project `tamcam---ai`:

```powershell
firebase use tamcam---ai
```

4. Deploy Firestore rules:

```powershell
firebase deploy --only firestore:rules
```

## Dieu kien de app khong bi loi quyen

Khi ghi du lieu vao `tasks`, `documents`, `chatConversations`, object phai co:

```json
{
  "userId": "uid-cua-user-dang-nhap"
}
```

Code hien tai da ghi `userId: auth.currentUser.uid` o cac luong chinh:

- Tao task.
- Luu tai lieu da upload.
- Luu lich su chat.

## Kiem thu nhanh

Sau khi deploy rules:

1. Dang nhap bang tai khoan A.
2. Tao task moi.
3. Upload mot file DOCX/PDF/TXT/Excel.
4. Chat va tao chat moi.
5. Xoa lich su chat.
6. Dang nhap tai khoan B va xac nhan khong thay du lieu cua tai khoan A.

Neu van gap `Missing or insufficient permissions`, kiem tra collection dang bi loi trong Console log. Thuong nguyen nhan la document moi khong co `userId`, hoac dang doc mot collection chua duoc khai bao trong rules.
