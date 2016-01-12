
#ifndef _itkImageJS_
#define _itkImageJS_

#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <emscripten.h>
#include <bind.h>

#include <itkImage.h>
#include <itkImageFileReader.h>
#include <itkImageFileWriter.h>
#include <itkNearestNeighborInterpolateImageFunction.h>
#include <itkImageSliceIteratorWithIndex.h>
#include <itkOrientImageFilter.h>
#include <itkExtractImageFilter.h>

using namespace std;
using namespace emscripten;


class itkImageJS {
public:

  static const int dimension = 3;
  typedef unsigned short PixelType;
  typedef itk::Image< PixelType, dimension > InputImageType;
  typedef typename InputImageType::Pointer InputImagePointerType;
  typedef typename InputImageType::IndexType InputImageIndexType;
  typedef typename InputImageType::SpacingType SpacingType;
  typedef typename InputImageType::PointType PointType;
  typedef typename InputImageType::RegionType RegionType;
  typedef typename InputImageType::SizeType SizeType;
  typedef typename InputImageType::DirectionType DirectionType;
  typedef typename InputImageType::IndexType IndexType;

  typedef itk::Image< PixelType, 2 >  ImageType2D;
  typedef typename ImageType2D::Pointer ImagePointerType2D;
  typedef ImageType2D::RegionType RegionType2D;
  typedef ImageType2D::RegionType::SizeType SizeType2D;
  typedef ImageType2D::RegionType::IndexType IndexType2D;

  typedef itk::ExtractImageFilter< InputImageType, InputImageType > ExtractFilterType;
  typedef typename ExtractFilterType::Pointer ExtractFilterPointerType;

  typedef itk::ImageSliceIteratorWithIndex<InputImageType> ImageIteratorType;

  typedef itk::ImageRegionIteratorWithIndex< ImageType2D > ImageIterator2DType;
  
  typedef itk::ImageFileReader< InputImageType > ImageFileReader;
  typedef itk::ImageFileWriter< InputImageType > ImageFileWriter;

  typedef itk::NearestNeighborInterpolateImageFunction< InputImageType > InterpolateFunctionType;
  typedef typename InterpolateFunctionType::Pointer InterpolateFunctionPointerType;

  typedef itk::OrientImageFilter< InputImageType, InputImageType > OrientImageFilterType;
  typedef typename OrientImageFilterType::Pointer OrientImageFilterPointerType;

  itkImageJS();
  ~itkImageJS();

  void Initialize();

  void MountDirectory(const string filename);

  void ReadImage();

  void WriteImage();

  int GetBufferPointer(){
    int buffer = (int)this->GetImage()->GetBufferPointer();
    return buffer/sizeof(PixelType);
  }

  int GetBufferSize(){
    return (int)this->GetImage()->GetPixelContainer()->Size();
  }

  int GetSpacing(){
    int ptr = (int)((int)(m_Spacing))/sizeof(double);
    return ptr;
  }

  int GetOrigin(){
    int ptr = (int)((int)m_Origin)/sizeof(double);
    return ptr;
  }

  int GetPixel(int i, int j, int k){
    InputImageIndexType index;
    index[0] = i;
    index[1] = j;
    index[2] = k;
    return this->GetImage()->GetPixel(index);
  }

  int GetPixelWorld(double x, double y, double z){
    PointType point;
    point[0] = x;
    point[1] = y;
    point[2] = z;
    return this->GetInterpolator()->Evaluate(point);
  }

  void SetPixel(int x, int y, int z, int value){
    InputImageIndexType index;
    index[0] = x;
    index[1] = y;
    index[2] = z;
    this->GetImage()->SetPixel(index, value);
  }

  int GetDimensions(){
    int ptr = (int)((int)m_Size)/sizeof(int);
    return ptr;
  }

  int GetDirection(){
    int ptr = (int)((int)m_Direction)/sizeof(double);
    return ptr;
  }

  int GetDataType(){
    if(typeid(PixelType).name() == typeid(unsigned short).name()){
      return 512;
    }
    return 16;
  }

  int GetFilename(){
    return (int) m_Filename.c_str();
  }

  void SetFilename(string filename){
    m_Filename = filename;
  }

  InputImagePointerType GetImage() const { return m_Image; }
  void SetImage(InputImagePointerType image){ m_Image = image; }

  InterpolateFunctionPointerType GetInterpolator() const { return m_Interpolate; }
  void SetInterpolator(InterpolateFunctionPointerType interpolate){ m_Interpolate = interpolate; }

  int GetSlice(string axis, int slice);


private:
  string m_Filename;
  InputImagePointerType m_Image;
  double m_Spacing[3];
  double m_Origin[3];
  double m_Direction[9];
  int m_Size[3];

  InterpolateFunctionPointerType m_Interpolate;

  typedef map< string, int > MapStringInt;
  MapStringInt m_MapStringDirection;
  vector< InputImagePointerType > m_VectorImageSlice;
  vector< ExtractFilterPointerType > m_VectorExtractFilter;

  
};

#endif